-- Account settings: blocked users list/unblock and delayed self account deletion.
-- Run this in the Supabase SQL Editor.

create table if not exists public.user_blocks (
  id bigserial primary key,
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id),
  constraint user_blocks_blocker_blocked_unique unique (blocker_id, blocked_id)
);

create table if not exists public.hidden_listings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id bigint not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.user_blocks enable row level security;
alter table public.hidden_listings enable row level security;

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own
on public.user_blocks
for select
using (blocker_id = auth.uid());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
on public.user_blocks
for insert
with check (blocker_id = auth.uid());

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own
on public.user_blocks
for delete
using (blocker_id = auth.uid());

grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists hidden_listings_select_own on public.hidden_listings;
create policy hidden_listings_select_own
on public.hidden_listings
for select
using (user_id = auth.uid());

drop policy if exists hidden_listings_insert_own on public.hidden_listings;
create policy hidden_listings_insert_own
on public.hidden_listings
for insert
with check (user_id = auth.uid());

drop policy if exists hidden_listings_delete_own on public.hidden_listings;
create policy hidden_listings_delete_own
on public.hidden_listings
for delete
using (user_id = auth.uid());

grant select, insert, delete on public.hidden_listings to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'user_blocks_id_seq'
  ) then
    grant usage, select on sequence public.user_blocks_id_seq to authenticated;
  end if;
end $$;

alter table public.profiles
  add column if not exists status text not null default 'active',
  add column if not exists can_create_listing boolean not null default true,
  add column if not exists can_start_chat boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists reports_count integer not null default 0,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_at timestamptz,
  add column if not exists deletion_cancelled_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_previous_status text,
  add column if not exists deletion_previous_can_create_listing boolean,
  add column if not exists deletion_previous_can_start_chat boolean;

create index if not exists profiles_deletion_scheduled_idx
on public.profiles (deletion_scheduled_at)
where status = 'deletion_pending';

create or replace function public.request_current_user_deletion()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Login required';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  if coalesce(v_profile.status, 'active') = 'deletion_pending' then
    return v_profile;
  end if;

  update public.profiles
  set
    status = 'deletion_pending',
    can_create_listing = false,
    can_start_chat = false,
    deletion_requested_at = now(),
    deletion_scheduled_at = now() + interval '3 days',
    deletion_cancelled_at = null,
    deletion_previous_status = coalesce(v_profile.status, 'active'),
    deletion_previous_can_create_listing = coalesce(v_profile.can_create_listing, true),
    deletion_previous_can_start_chat = coalesce(v_profile.can_start_chat, true),
    updated_at = now()
  where id = v_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.cancel_current_user_deletion()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Login required';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  if coalesce(v_profile.status, 'active') <> 'deletion_pending' then
    return v_profile;
  end if;

  if v_profile.deletion_scheduled_at is not null
     and v_profile.deletion_scheduled_at <= now() then
    raise exception 'Account deletion grace period has ended';
  end if;

  update public.profiles
  set
    status = coalesce(v_profile.deletion_previous_status, 'active'),
    can_create_listing = coalesce(v_profile.deletion_previous_can_create_listing, true),
    can_start_chat = coalesce(v_profile.deletion_previous_can_start_chat, true),
    deletion_requested_at = null,
    deletion_scheduled_at = null,
    deletion_cancelled_at = now(),
    deletion_previous_status = null,
    deletion_previous_can_create_listing = null,
    deletion_previous_can_start_chat = null,
    updated_at = now()
  where id = v_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.request_current_user_deletion();
end;
$$;

create or replace function public.permanently_delete_expired_users()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer := 0;
begin
  with due_users as (
    select id
    from public.profiles
    where status = 'deletion_pending'
      and deletion_scheduled_at <= now()
  ),
  deleted_users as (
    delete from auth.users u
    using due_users d
    where u.id = d.id
    returning u.id
  )
  select count(*) into v_count from deleted_users;

  return v_count;
end;
$$;

revoke all on function public.request_current_user_deletion() from public;
revoke all on function public.cancel_current_user_deletion() from public;
revoke all on function public.delete_current_user() from public;
revoke all on function public.permanently_delete_expired_users() from public;

grant execute on function public.request_current_user_deletion() to authenticated;
grant execute on function public.cancel_current_user_deletion() to authenticated;
grant execute on function public.delete_current_user() to authenticated;
grant execute on function public.permanently_delete_expired_users() to service_role;

select pg_notify('pgrst', 'reload schema');
