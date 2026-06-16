-- Admin setup for notices, reports, users, and listing moderation.
-- Run this in Supabase SQL Editor.

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists can_create_listing boolean not null default true,
  add column if not exists can_start_chat boolean not null default true,
  add column if not exists status text not null default 'active',
  add column if not exists reports_count integer not null default 0;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.listings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.listings drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.listings
  add constraint listings_status_check
  check (status is null or status in ('active', 'reserved', 'done', 'hidden', 'delete_pending'));

alter table public.listings
  add column if not exists admin_deleted_at timestamptz,
  add column if not exists admin_delete_scheduled_at timestamptz,
  add column if not exists admin_delete_cancelled_at timestamptz,
  add column if not exists admin_delete_previous_status text,
  add column if not exists admin_deleted_by uuid references public.profiles(id) on delete set null;

create index if not exists listings_admin_delete_scheduled_idx
on public.listings (admin_delete_scheduled_at)
where status = 'delete_pending';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(status, 'active') = 'active'
  );
$$;

grant execute on function public.is_admin() to authenticated;

create table if not exists public.notices (
  id bigserial primary key,
  title text not null,
  content text not null,
  is_published boolean not null default true,
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notices
  add column if not exists is_published boolean not null default true,
  add column if not exists author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.notices enable row level security;

drop policy if exists notices_select_published_or_admin on public.notices;
create policy notices_select_published_or_admin
on public.notices
for select
using (is_published = true or public.is_admin());

drop policy if exists notices_admin_insert on public.notices;
create policy notices_admin_insert
on public.notices
for insert
with check (public.is_admin());

drop policy if exists notices_admin_update on public.notices;
create policy notices_admin_update
on public.notices
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists notices_admin_delete on public.notices;
create policy notices_admin_delete
on public.notices
for delete
using (public.is_admin());

alter table public.reports
  add column if not exists status text not null default 'pending',
  add column if not exists admin_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select
on public.profiles
for select
using (public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
on public.profiles
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists reports_admin_select on public.reports;
create policy reports_admin_select
on public.reports
for select
using (public.is_admin());

drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update
on public.reports
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists listings_admin_select on public.listings;
create policy listings_admin_select
on public.listings
for select
using (public.is_admin());

drop policy if exists listings_admin_update on public.listings;
create policy listings_admin_update
on public.listings
for update
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.admin_logs (
  id bigserial primary key,
  admin_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action text not null,
  target_table text,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_logs enable row level security;

drop policy if exists admin_logs_admin_select on public.admin_logs;
create policy admin_logs_admin_select
on public.admin_logs
for select
using (public.is_admin());

drop policy if exists admin_logs_admin_insert on public.admin_logs;
create policy admin_logs_admin_insert
on public.admin_logs
for insert
with check (public.is_admin());

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status text,
  p_can_start_chat boolean,
  p_can_create_listing boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can update user status';
  end if;

  if p_user_id = auth.uid() and p_status <> 'active' then
    raise exception 'Admins cannot suspend themselves';
  end if;

  if p_status not in ('active', 'suspended', 'blocked') then
    raise exception 'Invalid user status';
  end if;

  update public.profiles
  set
    status = p_status,
    can_start_chat = coalesce(p_can_start_chat, can_start_chat),
    can_create_listing = coalesce(p_can_create_listing, can_create_listing),
    updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  if not found then
    raise exception 'User profile not found';
  end if;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_set_user_status',
    'profiles',
    p_user_id::text,
    jsonb_build_object(
      'status', p_status,
      'can_start_chat', p_can_start_chat,
      'can_create_listing', p_can_create_listing
    )
  );

  return v_profile;
end;
$$;

create or replace function public.admin_update_report_status(
  p_report_id bigint,
  p_status text,
  p_admin_note text default null
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can update reports';
  end if;

  if p_status not in ('pending', 'reviewed', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  update public.reports
  set
    status = p_status,
    admin_note = p_admin_note,
    resolved_at = case when p_status = 'pending' then null else now() end,
    resolved_by = case when p_status = 'pending' then null else auth.uid() end
  where id = p_report_id
  returning * into v_report;

  if not found then
    raise exception 'Report not found';
  end if;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_update_report_status',
    'reports',
    p_report_id::text,
    jsonb_build_object('status', p_status)
  );

  return v_report;
end;
$$;

create or replace function public.admin_delete_report(
  p_report_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_user_id uuid;
  v_remaining_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete reports';
  end if;

  select target_user_id
  into v_target_user_id
  from public.reports
  where id = p_report_id;

  if not found then
    raise exception 'Report not found';
  end if;

  delete from public.reports
  where id = p_report_id;

  select count(*)::integer
  into v_remaining_count
  from public.reports
  where target_user_id = v_target_user_id;

  update public.profiles
  set reports_count = v_remaining_count
  where id = v_target_user_id;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_delete_report',
    'reports',
    p_report_id::text,
    jsonb_build_object(
      'target_user_id', v_target_user_id,
      'remaining_reports_count', v_remaining_count
    )
  );
end;
$$;

create or replace function public.admin_set_listing_status(
  p_listing_id bigint,
  p_status text
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can update listing status';
  end if;

  if p_status not in ('active', 'reserved', 'done', 'hidden', 'delete_pending') then
    raise exception 'Invalid listing status';
  end if;

  update public.listings
  set
    status = p_status,
    admin_deleted_at = case when p_status = 'delete_pending' then now() else admin_deleted_at end,
    admin_delete_scheduled_at = case when p_status = 'delete_pending' then now() + interval '3 days' else admin_delete_scheduled_at end,
    admin_deleted_by = case when p_status = 'delete_pending' then auth.uid() else admin_deleted_by end
  where id = p_listing_id
  returning * into v_listing;

  if not found then
    raise exception 'Listing not found';
  end if;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_set_listing_status',
    'listings',
    p_listing_id::text,
    jsonb_build_object('status', p_status)
  );

  return v_listing;
end;
$$;

create or replace function public.admin_request_listing_delete(
  p_listing_id bigint
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete listings';
  end if;

  select *
  into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'Listing not found';
  end if;

  if coalesce(v_listing.status, 'active') = 'delete_pending' then
    return v_listing;
  end if;

  update public.listings
  set
    status = 'delete_pending',
    admin_deleted_at = now(),
    admin_delete_scheduled_at = now() + interval '3 days',
    admin_delete_cancelled_at = null,
    admin_delete_previous_status = coalesce(v_listing.status, 'active'),
    admin_deleted_by = auth.uid()
  where id = p_listing_id
  returning * into v_listing;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_request_listing_delete',
    'listings',
    p_listing_id::text,
    jsonb_build_object(
      'previous_status', v_listing.admin_delete_previous_status,
      'delete_scheduled_at', v_listing.admin_delete_scheduled_at
    )
  );

  return v_listing;
end;
$$;

create or replace function public.admin_cancel_listing_delete(
  p_listing_id bigint
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can cancel listing deletion';
  end if;

  select *
  into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'Listing not found';
  end if;

  if coalesce(v_listing.status, 'active') <> 'delete_pending' then
    return v_listing;
  end if;

  if v_listing.admin_delete_scheduled_at is not null
     and v_listing.admin_delete_scheduled_at <= now() then
    raise exception 'Listing deletion cancellation period has ended';
  end if;

  update public.listings
  set
    status = coalesce(v_listing.admin_delete_previous_status, 'active'),
    admin_delete_cancelled_at = now(),
    admin_deleted_at = null,
    admin_delete_scheduled_at = null,
    admin_delete_previous_status = null,
    admin_deleted_by = null
  where id = p_listing_id
  returning * into v_listing;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_cancel_listing_delete',
    'listings',
    p_listing_id::text,
    jsonb_build_object('restored_status', v_listing.status)
  );

  return v_listing;
end;
$$;

create or replace function public.permanently_delete_expired_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with deleted_listings as (
    delete from public.listings
    where status = 'delete_pending'
      and admin_delete_scheduled_at <= now()
    returning id
  )
  select count(*) into v_count from deleted_listings;

  return v_count;
end;
$$;

grant select, insert, update, delete on public.notices to authenticated;
grant usage, select on sequence public.notices_id_seq to authenticated;
grant select, insert on public.admin_logs to authenticated;
grant usage, select on sequence public.admin_logs_id_seq to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, boolean, boolean) to authenticated;
grant execute on function public.admin_update_report_status(bigint, text, text) to authenticated;
grant execute on function public.admin_delete_report(bigint) to authenticated;
grant execute on function public.admin_set_listing_status(bigint, text) to authenticated;
grant execute on function public.admin_request_listing_delete(bigint) to authenticated;
grant execute on function public.admin_cancel_listing_delete(bigint) to authenticated;
grant execute on function public.permanently_delete_expired_listings() to service_role;

-- After running the migration, make your account an admin.
-- Replace the email and run:
-- update public.profiles set role = 'admin' where email = 'YOUR_EMAIL@example.com';
