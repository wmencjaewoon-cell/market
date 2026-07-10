-- Admin moderation improvements:
-- - Let admins clean up listing deletions whose cancellation window expired.
-- - Let admins set temporary day-based restrictions or permanent suspension.

alter table public.profiles
  add column if not exists restricted_until timestamptz,
  add column if not exists restriction_reason text;

create index if not exists profiles_restricted_until_idx
on public.profiles (restricted_until)
where status = 'suspended';

do $$
begin
  if to_regclass('public.chat_rooms') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_rooms'
      and column_name = 'listing_id'
      and is_nullable = 'NO'
  ) then
    alter table public.chat_rooms alter column listing_id drop not null;
  end if;

  if to_regclass('public.reviews') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'listing_id'
      and is_nullable = 'NO'
  ) then
    alter table public.reviews alter column listing_id drop not null;
  end if;
end $$;

create or replace function public.refresh_expired_user_restriction(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    status = 'active',
    can_create_listing = true,
    can_start_chat = true,
    restricted_until = null,
    restriction_reason = null,
    updated_at = now()
  where id = p_user_id
    and status = 'suspended'
    and restriction_reason in ('reports', 'admin')
    and restricted_until is not null
    and restricted_until <= now();
end;
$$;

create or replace function public.get_user_restriction_message(
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_reason text;
begin
  if p_user_id is null then
    return '로그인이 필요합니다.';
  end if;

  perform public.refresh_expired_user_restriction(p_user_id);

  select *
  into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    return '회원 정보를 찾을 수 없습니다.';
  end if;

  v_reason := case
    when coalesce(v_profile.restriction_reason, '') = 'admin' then '관리자 조치로'
    else '신고 누적으로'
  end;

  if coalesce(v_profile.status, 'active') = 'deletion_pending' then
    return '탈퇴 대기 중인 계정입니다. 탈퇴를 취소해야 이용할 수 있습니다.';
  end if;

  if coalesce(v_profile.status, 'active') = 'blocked' then
    return v_reason || ' 영구 이용제한된 계정입니다.';
  end if;

  if coalesce(v_profile.status, 'active') = 'suspended' then
    if v_profile.restricted_until is null or v_profile.restricted_until > now() then
      return v_reason || ' ' ||
        coalesce(
          to_char(v_profile.restricted_until at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
          '제한 해제 시점'
        ) ||
        '까지 이용이 제한된 계정입니다.';
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.admin_set_user_restriction(
  p_user_id uuid,
  p_days integer default null,
  p_permanent boolean default false,
  p_reason text default 'admin'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_until timestamptz;
  v_status text;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'admin');
begin
  if not public.is_admin() then
    raise exception 'Only admins can restrict users';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Admins cannot restrict themselves';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  if coalesce(v_profile.status, 'active') = 'deletion_pending' then
    raise exception 'Deletion pending users cannot be restricted here';
  end if;

  if p_permanent then
    v_status := 'blocked';
    v_until := null;
  else
    if p_days is null or p_days < 1 then
      raise exception 'Restriction days must be at least 1';
    end if;

    v_status := 'suspended';
    v_until := now() + make_interval(days => least(p_days, 3650));
  end if;

  update public.profiles
  set
    status = v_status,
    can_start_chat = false,
    can_create_listing = false,
    restricted_until = v_until,
    restriction_reason = v_reason,
    updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_set_user_restriction',
    'profiles',
    p_user_id::text,
    jsonb_build_object(
      'status', v_status,
      'restricted_until', v_until,
      'restriction_reason', v_reason,
      'days', p_days,
      'permanent', p_permanent
    )
  );

  return v_profile;
end;
$$;

create or replace function public.admin_clear_user_restriction(
  p_user_id uuid
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
    raise exception 'Only admins can clear user restrictions';
  end if;

  update public.profiles
  set
    status = 'active',
    can_start_chat = true,
    can_create_listing = true,
    restricted_until = null,
    restriction_reason = null,
    updated_at = now()
  where id = p_user_id
    and coalesce(status, 'active') <> 'deletion_pending'
  returning * into v_profile;

  if not found then
    raise exception 'User profile not found';
  end if;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_clear_user_restriction',
    'profiles',
    p_user_id::text,
    jsonb_build_object('status', 'active')
  );

  return v_profile;
end;
$$;

create or replace function public.admin_refresh_expired_user_restrictions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can refresh expired user restrictions';
  end if;

  update public.profiles
  set
    status = 'active',
    can_create_listing = true,
    can_start_chat = true,
    restricted_until = null,
    restriction_reason = null,
    updated_at = now()
  where status = 'suspended'
    and restriction_reason in ('reports', 'admin')
    and restricted_until is not null
    and restricted_until <= now();

  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into public.admin_logs (action, target_table, detail)
    values (
      'admin_refresh_expired_user_restrictions',
      'profiles',
      jsonb_build_object('refreshed_count', v_count)
    );
  end if;

  return v_count;
end;
$$;

create or replace function public.admin_permanently_delete_expired_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can clean up expired listing deletions';
  end if;

  drop table if exists pg_temp.expired_admin_listing_delete_ids;

  create temporary table expired_admin_listing_delete_ids (
    id bigint primary key
  ) on commit drop;

  insert into expired_admin_listing_delete_ids (id)
  select id
  from public.listings
  where status = 'delete_pending'
    and admin_delete_scheduled_at is not null
    and admin_delete_scheduled_at <= now()
  on conflict do nothing;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    return 0;
  end if;

  if to_regclass('public.listing_images') is not null then
    execute 'delete from public.listing_images where listing_id in (select id from expired_admin_listing_delete_ids)';
  end if;

  if to_regclass('public.favorites') is not null then
    execute 'delete from public.favorites where listing_id in (select id from expired_admin_listing_delete_ids)';
  end if;

  if to_regclass('public.hidden_listings') is not null then
    execute 'delete from public.hidden_listings where listing_id in (select id from expired_admin_listing_delete_ids)';
  end if;

  if to_regclass('public.chat_rooms') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_rooms'
      and column_name = 'listing_id'
      and is_nullable = 'YES'
  ) then
    execute 'update public.chat_rooms set listing_id = null where listing_id in (select id from expired_admin_listing_delete_ids)';
  end if;

  if to_regclass('public.reviews') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'listing_id'
      and is_nullable = 'YES'
  ) then
    execute 'update public.reviews set listing_id = null where listing_id in (select id from expired_admin_listing_delete_ids)';
  end if;

  delete from public.listings
  where id in (select id from expired_admin_listing_delete_ids);

  insert into public.admin_logs (action, target_table, detail)
  values (
    'admin_permanently_delete_expired_listings',
    'listings',
    jsonb_build_object('deleted_count', v_count)
  );

  return v_count;
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
  drop table if exists pg_temp.expired_admin_listing_delete_ids;

  create temporary table expired_admin_listing_delete_ids (
    id bigint primary key
  ) on commit drop;

  insert into expired_admin_listing_delete_ids (id)
  select id
  from public.listings
  where status = 'delete_pending'
    and admin_delete_scheduled_at is not null
    and admin_delete_scheduled_at <= now()
  on conflict do nothing;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    return 0;
  end if;

  if to_regclass('public.listing_images') is not null then
    execute 'delete from public.listing_images where listing_id in (select id from expired_admin_listing_delete_ids)';
  end if;

  if to_regclass('public.favorites') is not null then
    execute 'delete from public.favorites where listing_id in (select id from expired_admin_listing_delete_ids)';
  end if;

  if to_regclass('public.hidden_listings') is not null then
    execute 'delete from public.hidden_listings where listing_id in (select id from expired_admin_listing_delete_ids)';
  end if;

  if to_regclass('public.chat_rooms') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_rooms'
      and column_name = 'listing_id'
      and is_nullable = 'YES'
  ) then
    execute 'update public.chat_rooms set listing_id = null where listing_id in (select id from expired_admin_listing_delete_ids)';
  end if;

  if to_regclass('public.reviews') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'listing_id'
      and is_nullable = 'YES'
  ) then
    execute 'update public.reviews set listing_id = null where listing_id in (select id from expired_admin_listing_delete_ids)';
  end if;

  delete from public.listings
  where id in (select id from expired_admin_listing_delete_ids);

  return v_count;
end;
$$;

revoke all on function public.admin_set_user_restriction(uuid, integer, boolean, text) from public;
revoke all on function public.admin_clear_user_restriction(uuid) from public;
revoke all on function public.admin_refresh_expired_user_restrictions() from public;
revoke all on function public.admin_permanently_delete_expired_listings() from public;
revoke all on function public.permanently_delete_expired_listings() from public;

grant execute on function public.admin_set_user_restriction(uuid, integer, boolean, text) to authenticated;
grant execute on function public.admin_clear_user_restriction(uuid) to authenticated;
grant execute on function public.admin_refresh_expired_user_restrictions() to authenticated;
grant execute on function public.admin_permanently_delete_expired_listings() to authenticated;
grant execute on function public.permanently_delete_expired_listings() to service_role;

select pg_notify('pgrst', 'reload schema');
