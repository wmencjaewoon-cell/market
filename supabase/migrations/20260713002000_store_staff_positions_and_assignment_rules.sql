-- Staff position labels and direct assignment rules.
-- Managers can administer the store, but they cannot be selected as direct
-- inquiry/estimate assignees.

alter table public.store_staff_members
  add column if not exists position text;

create or replace function public.is_assignable_store_staff(
  p_store_user_id uuid,
  p_staff_user_id uuid
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
      and s.role = 'staff'
      and s.status = 'active'
      and coalesce(p.status, 'active') = 'active'
  );
$$;

grant execute on function public.is_assignable_store_staff(uuid, uuid) to authenticated;

create or replace function public.enforce_estimate_assignable_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_user_id uuid;
begin
  v_store_user_id := coalesce(new.assigned_store_user_id, new.preferred_store_user_id);

  if new.preferred_staff_user_id is not null
     and not public.is_assignable_store_staff(v_store_user_id, new.preferred_staff_user_id) then
    raise exception '매니저 또는 비활성 직원에게는 견적문의를 직접 배정할 수 없습니다.';
  end if;

  if new.assigned_staff_user_id is not null
     and not public.is_assignable_store_staff(v_store_user_id, new.assigned_staff_user_id) then
    raise exception '매니저 또는 비활성 직원에게는 견적문의를 직접 배정할 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists estimate_requests_assignable_staff_before_save on public.estimate_requests;
create trigger estimate_requests_assignable_staff_before_save
before insert or update of preferred_staff_user_id, assigned_staff_user_id, preferred_store_user_id, assigned_store_user_id
on public.estimate_requests
for each row execute function public.enforce_estimate_assignable_staff();

create or replace function public.enforce_chat_assignable_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_staff_user_id is not null
     and not public.is_assignable_store_staff(new.store_user_id, new.assigned_staff_user_id) then
    raise exception '매니저 또는 비활성 직원에게는 문의를 직접 배정할 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists chat_rooms_assignable_staff_before_save on public.chat_rooms;
create trigger chat_rooms_assignable_staff_before_save
before insert or update of assigned_staff_user_id, store_user_id
on public.chat_rooms
for each row execute function public.enforce_chat_assignable_staff();

create or replace function public.update_store_staff_member(
  p_staff_member_id uuid,
  p_display_name text,
  p_phone text default null,
  p_position text default null,
  p_role text default 'staff'
)
returns public.store_staff_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.store_staff_members%rowtype;
  v_role text := case when p_role = 'manager' then 'manager' else 'staff' end;
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
    raise exception '직원 수정 권한이 없습니다.';
  end if;

  update public.store_staff_members
  set
    display_name = nullif(trim(coalesce(p_display_name, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    position = nullif(trim(coalesce(p_position, '')), ''),
    role = v_role,
    updated_at = now()
  where id = p_staff_member_id
  returning * into v_staff;

  update public.profiles
  set
    display_name = coalesce(v_staff.display_name, display_name),
    phone = v_staff.phone,
    can_create_listing = case
      when coalesce(status, 'active') = 'active' then v_role = 'manager'
      else can_create_listing
    end,
    updated_at = now()
  where id = v_staff.staff_user_id;

  if v_role = 'manager' then
    update public.estimate_requests
    set
      preferred_staff_user_id = case
        when preferred_staff_user_id = v_staff.staff_user_id then null
        else preferred_staff_user_id
      end,
      assigned_staff_user_id = case
        when assigned_staff_user_id = v_staff.staff_user_id then null
        else assigned_staff_user_id
      end,
      updated_at = now()
    where preferred_staff_user_id = v_staff.staff_user_id
       or assigned_staff_user_id = v_staff.staff_user_id;

    update public.chat_rooms
    set assigned_staff_user_id = null
    where assigned_staff_user_id = v_staff.staff_user_id;
  end if;

  return v_staff;
end;
$$;

grant execute on function public.update_store_staff_member(
  uuid,
  text,
  text,
  text,
  text
) to authenticated;

update public.estimate_requests er
set
  preferred_staff_user_id = case
    when exists (
      select 1
      from public.store_staff_members s
      where s.staff_user_id = er.preferred_staff_user_id
        and s.role = 'manager'
    ) then null
    else preferred_staff_user_id
  end,
  assigned_staff_user_id = case
    when exists (
      select 1
      from public.store_staff_members s
      where s.staff_user_id = er.assigned_staff_user_id
        and s.role = 'manager'
    ) then null
    else assigned_staff_user_id
  end,
  updated_at = now()
where exists (
  select 1
  from public.store_staff_members s
  where s.role = 'manager'
    and (
      s.staff_user_id = er.preferred_staff_user_id
      or s.staff_user_id = er.assigned_staff_user_id
    )
);

update public.chat_rooms cr
set assigned_staff_user_id = null
where exists (
  select 1
  from public.store_staff_members s
  where s.staff_user_id = cr.assigned_staff_user_id
    and s.role = 'manager'
);

select pg_notify('pgrst', 'reload schema');
