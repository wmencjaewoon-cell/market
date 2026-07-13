-- Store staff accounts, assignment, and inactive staff history retention.

create extension if not exists pgcrypto;

alter table public.estimate_requests
  add column if not exists preferred_staff_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_staff_user_id uuid references public.profiles(id) on delete set null;

alter table public.chat_rooms
  add column if not exists assigned_staff_user_id uuid references public.profiles(id) on delete set null;

create table if not exists public.store_staff_members (
  id uuid primary key default gen_random_uuid(),
  store_user_id uuid not null references public.profiles(id) on delete cascade,
  staff_user_id uuid not null references public.profiles(id) on delete restrict,
  staff_login_id text not null unique,
  role text not null default 'staff',
  status text not null default 'active',
  display_name text,
  phone text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_user_id, staff_user_id)
);

alter table public.store_staff_members enable row level security;

alter table public.store_staff_members
  drop constraint if exists store_staff_members_role_check;

alter table public.store_staff_members
  add constraint store_staff_members_role_check
  check (role in ('manager', 'staff'));

alter table public.store_staff_members
  drop constraint if exists store_staff_members_status_check;

alter table public.store_staff_members
  add constraint store_staff_members_status_check
  check (status in ('active', 'inactive'));

create index if not exists store_staff_members_store_status_idx
on public.store_staff_members (store_user_id, status, created_at desc);

create index if not exists store_staff_members_staff_status_idx
on public.store_staff_members (staff_user_id, status);

create index if not exists estimate_requests_assigned_staff_idx
on public.estimate_requests (assigned_staff_user_id, created_at desc)
where assigned_staff_user_id is not null;

create index if not exists chat_rooms_assigned_staff_idx
on public.chat_rooms (assigned_staff_user_id, created_at desc)
where assigned_staff_user_id is not null;

create or replace function public.is_verified_store_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.user_type = 'store'
      and coalesce(p.business_verified, false)
      and coalesce(p.status, 'active') = 'active'
  );
$$;

create or replace function public.get_active_staff_store_id(p_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.store_user_id
  from public.store_staff_members s
  join public.profiles p on p.id = s.staff_user_id
  where s.staff_user_id = p_user_id
    and s.status = 'active'
    and coalesce(p.status, 'active') = 'active'
  order by s.created_at desc
  limit 1;
$$;

create or replace function public.is_active_store_staff(
  p_store_user_id uuid,
  p_staff_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_staff_members s
    join public.profiles p on p.id = s.staff_user_id
    where s.store_user_id = p_store_user_id
      and s.staff_user_id = p_staff_user_id
      and s.status = 'active'
      and coalesce(p.status, 'active') = 'active'
  );
$$;

create or replace function public.is_store_owner_or_active_staff(p_store_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = p_store_user_id
    or public.is_admin()
    or public.is_active_store_staff(p_store_user_id, auth.uid());
$$;

create or replace function public.store_can_access_estimate_request(p_request_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.estimate_requests er
    where er.id = p_request_id
      and (
        public.is_admin()
        or (
          public.is_verified_store_owner(auth.uid())
          and (
            er.preferred_store_user_id = auth.uid()
            or er.assigned_store_user_id = auth.uid()
          )
        )
        or (
          er.assigned_staff_user_id = auth.uid()
          and public.is_active_store_staff(
            coalesce(er.assigned_store_user_id, er.preferred_store_user_id),
            auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.can_manage_estimate_for_store(
  p_store_user_id uuid,
  p_estimate_request_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.estimate_requests er
    where er.id = p_estimate_request_id
      and (
        public.is_admin()
        or (
          auth.uid() = p_store_user_id
          and public.is_verified_store_owner(auth.uid())
          and (
            er.preferred_store_user_id = p_store_user_id
            or er.assigned_store_user_id = p_store_user_id
          )
        )
        or (
          er.assigned_staff_user_id = auth.uid()
          and public.is_active_store_staff(p_store_user_id, auth.uid())
        )
      )
  );
$$;

grant execute on function public.is_verified_store_owner(uuid) to authenticated;
grant execute on function public.get_active_staff_store_id(uuid) to authenticated;
grant execute on function public.is_active_store_staff(uuid, uuid) to authenticated;
grant execute on function public.is_store_owner_or_active_staff(uuid) to authenticated;
grant execute on function public.store_can_access_estimate_request(bigint) to authenticated;
grant execute on function public.can_manage_estimate_for_store(uuid, bigint) to authenticated;

drop policy if exists store_staff_members_select_related on public.store_staff_members;
drop policy if exists store_staff_members_select_active_authenticated on public.store_staff_members;
create policy store_staff_members_select_related
on public.store_staff_members
for select
using (
  public.is_admin()
  or auth.uid() = store_user_id
  or auth.uid() = staff_user_id
  or status = 'active'
);

drop policy if exists store_staff_members_update_owner_or_admin on public.store_staff_members;
create policy store_staff_members_update_owner_or_admin
on public.store_staff_members
for update
using (
  public.is_admin()
  or (
    auth.uid() = store_user_id
    and public.is_verified_store_owner(auth.uid())
  )
)
with check (
  public.is_admin()
  or (
    auth.uid() = store_user_id
    and public.is_verified_store_owner(auth.uid())
  )
);

drop policy if exists estimate_requests_select_participants on public.estimate_requests;
create policy estimate_requests_select_participants
on public.estimate_requests
for select
using (
  auth.uid() = user_id
  or public.is_admin()
  or public.store_can_access_estimate_request(id)
);

drop policy if exists estimate_requests_update_own_or_admin on public.estimate_requests;
drop policy if exists estimate_requests_update_participants on public.estimate_requests;
create policy estimate_requests_update_participants
on public.estimate_requests
for update
using (
  auth.uid() = user_id
  or public.is_admin()
  or public.store_can_access_estimate_request(id)
)
with check (
  auth.uid() = user_id
  or public.is_admin()
  or public.store_can_access_estimate_request(id)
);

drop policy if exists estimate_request_images_select_participants on public.estimate_request_images;
create policy estimate_request_images_select_participants
on public.estimate_request_images
for select
using (
  exists (
    select 1
    from public.estimate_requests er
    where er.id = estimate_request_id
      and (
        er.user_id = auth.uid()
        or public.is_admin()
        or public.store_can_access_estimate_request(er.id)
      )
  )
);

drop policy if exists estimate_request_store_statuses_select_participants on public.estimate_request_store_statuses;
create policy estimate_request_store_statuses_select_participants
on public.estimate_request_store_statuses
for select
using (
  public.is_admin()
  or auth.uid() = store_user_id
  or public.can_manage_estimate_for_store(store_user_id, estimate_request_id)
  or exists (
    select 1
    from public.estimate_requests er
    where er.id = estimate_request_id
      and er.user_id = auth.uid()
  )
);

drop policy if exists estimate_request_store_statuses_insert_store on public.estimate_request_store_statuses;
create policy estimate_request_store_statuses_insert_store
on public.estimate_request_store_statuses
for insert
with check (
  public.can_manage_estimate_for_store(store_user_id, estimate_request_id)
);

drop policy if exists estimate_request_store_statuses_update_store on public.estimate_request_store_statuses;
create policy estimate_request_store_statuses_update_store
on public.estimate_request_store_statuses
for update
using (
  public.can_manage_estimate_for_store(store_user_id, estimate_request_id)
)
with check (
  public.can_manage_estimate_for_store(store_user_id, estimate_request_id)
);

drop policy if exists estimate_quotes_select_participants on public.estimate_quotes;
create policy estimate_quotes_select_participants
on public.estimate_quotes
for select
using (
  public.is_admin()
  or auth.uid() = store_user_id
  or public.can_manage_estimate_for_store(store_user_id, estimate_request_id)
  or exists (
    select 1
    from public.estimate_requests er
    where er.id = estimate_request_id
      and er.user_id = auth.uid()
  )
);

drop policy if exists estimate_quotes_insert_store on public.estimate_quotes;
create policy estimate_quotes_insert_store
on public.estimate_quotes
for insert
with check (
  public.can_manage_estimate_for_store(store_user_id, estimate_request_id)
);

drop policy if exists estimate_quotes_update_store on public.estimate_quotes;
create policy estimate_quotes_update_store
on public.estimate_quotes
for update
using (
  public.can_manage_estimate_for_store(store_user_id, estimate_request_id)
)
with check (
  public.can_manage_estimate_for_store(store_user_id, estimate_request_id)
);

drop policy if exists estimate_quote_attachments_select_participants on public.estimate_quote_attachments;
create policy estimate_quote_attachments_select_participants
on public.estimate_quote_attachments
for select
using (
  exists (
    select 1
    from public.estimate_quotes q
    join public.estimate_requests er on er.id = q.estimate_request_id
    where q.id = quote_id
      and (
        er.user_id = auth.uid()
        or public.is_admin()
        or public.can_manage_estimate_for_store(q.store_user_id, q.estimate_request_id)
      )
  )
);

drop policy if exists estimate_quote_attachments_insert_store on public.estimate_quote_attachments;
create policy estimate_quote_attachments_insert_store
on public.estimate_quote_attachments
for insert
with check (
  exists (
    select 1
    from public.estimate_quotes q
    where q.id = quote_id
      and public.can_manage_estimate_for_store(q.store_user_id, q.estimate_request_id)
  )
);

create or replace function public.deactivate_store_staff_member(p_staff_member_id uuid)
returns public.store_staff_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.store_staff_members%rowtype;
begin
  select *
  into v_staff
  from public.store_staff_members
  where id = p_staff_member_id
  for update;

  if not found then
    raise exception '직원 정보를 찾을 수 없습니다.';
  end if;

  if not (
    public.is_admin()
    or (
      auth.uid() = v_staff.store_user_id
      and public.is_verified_store_owner(auth.uid())
    )
  ) then
    raise exception '직원 비활성화 권한이 없습니다.';
  end if;

  update public.store_staff_members
  set
    status = 'inactive',
    left_at = coalesce(left_at, now()),
    deactivated_at = now(),
    updated_at = now()
  where id = p_staff_member_id
  returning * into v_staff;

  update public.profiles
  set
    status = 'staff_inactive',
    can_start_chat = false,
    can_create_listing = false,
    updated_at = now()
  where id = v_staff.staff_user_id;

  update public.estimate_requests
  set
    assigned_staff_user_id = null,
    updated_at = now()
  where assigned_staff_user_id = v_staff.staff_user_id;

  update public.chat_rooms
  set assigned_staff_user_id = null
  where assigned_staff_user_id = v_staff.staff_user_id;

  return v_staff;
end;
$$;

grant execute on function public.deactivate_store_staff_member(uuid) to authenticated;

create or replace function public.update_my_store_staff_profile(
  p_display_name text,
  p_phone text default null
)
returns public.store_staff_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.store_staff_members%rowtype;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  update public.store_staff_members
  set
    display_name = nullif(trim(coalesce(p_display_name, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    updated_at = now()
  where staff_user_id = auth.uid()
    and status = 'active'
  returning * into v_staff;

  if not found then
    raise exception '활성 직원 정보를 찾을 수 없습니다.';
  end if;

  return v_staff;
end;
$$;

grant execute on function public.update_my_store_staff_profile(text, text) to authenticated;

grant select, update on public.store_staff_members to authenticated;

select pg_notify('pgrst', 'reload schema');
