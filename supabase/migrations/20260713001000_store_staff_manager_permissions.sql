-- Store staff manager permissions and password-era account support.
-- This is intentionally idempotent so it can be run even if the previous
-- staff migration was already applied before manager permissions were added.

alter table public.profiles
  drop constraint if exists profiles_user_type_check;

alter table public.profiles
  add constraint profiles_user_type_check
  check (user_type in ('personal', 'store', 'staff'));

create or replace function public.is_active_store_manager(
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
      and s.role = 'manager'
      and s.status = 'active'
      and coalesce(p.status, 'active') = 'active'
  );
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
        or public.is_active_store_manager(
          coalesce(er.assigned_store_user_id, er.preferred_store_user_id),
          auth.uid()
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
        or public.is_active_store_manager(p_store_user_id, auth.uid())
      )
  );
$$;

grant execute on function public.is_active_store_manager(uuid, uuid) to authenticated;
grant execute on function public.store_can_access_estimate_request(bigint) to authenticated;
grant execute on function public.can_manage_estimate_for_store(uuid, bigint) to authenticated;

update public.profiles p
set
  can_create_listing = true,
  updated_at = now()
where exists (
  select 1
  from public.store_staff_members s
  where s.staff_user_id = p.id
    and s.role = 'manager'
    and s.status = 'active'
)
and coalesce(p.status, 'active') = 'active';

drop policy if exists store_interactions_select_own_store on public.store_interactions;
create policy store_interactions_select_own_store
on public.store_interactions
for select
using (
  auth.uid() = store_user_id
  or public.is_admin()
  or public.is_active_store_manager(store_user_id, auth.uid())
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
    or public.is_active_store_manager(v_staff.store_user_id, auth.uid())
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

create or replace function public.update_store_profile_settings(
  p_store_user_id uuid,
  p_store_category text default null,
  p_store_intro text default null,
  p_store_notice text default null,
  p_store_business_hours text default null,
  p_store_accepts_inquiries boolean default true,
  p_store_today_available boolean default false,
  p_store_card_available boolean default false,
  p_store_cash_receipt_available boolean default false,
  p_store_tax_invoice_available boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if p_store_user_id is null then
    raise exception '가게 정보를 찾을 수 없습니다.';
  end if;

  if not (
    public.is_admin()
    or (
      auth.uid() = p_store_user_id
      and public.is_verified_store_owner(auth.uid())
    )
    or public.is_active_store_manager(p_store_user_id, auth.uid())
  ) then
    raise exception '가게 프로필 수정 권한이 없습니다.';
  end if;

  update public.profiles
  set
    store_category = nullif(trim(coalesce(p_store_category, '')), ''),
    store_intro = nullif(trim(coalesce(p_store_intro, '')), ''),
    store_notice = nullif(trim(coalesce(p_store_notice, '')), ''),
    store_business_hours = nullif(trim(coalesce(p_store_business_hours, '')), ''),
    store_accepts_inquiries = coalesce(p_store_accepts_inquiries, true),
    store_today_available = coalesce(p_store_today_available, false),
    store_card_available = coalesce(p_store_card_available, false),
    store_cash_receipt_available = coalesce(p_store_cash_receipt_available, false),
    store_tax_invoice_available = coalesce(p_store_tax_invoice_available, false),
    updated_at = now()
  where id = p_store_user_id
    and user_type = 'store'
    and coalesce(business_verified, false)
  returning * into v_profile;

  if not found then
    raise exception '인증 완료된 가게 정보를 찾을 수 없습니다.';
  end if;

  return v_profile;
end;
$$;

grant execute on function public.update_store_profile_settings(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

select pg_notify('pgrst', 'reload schema');
