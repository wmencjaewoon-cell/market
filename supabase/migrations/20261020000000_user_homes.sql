begin;

create table if not exists public.user_homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  road_address text,
  jibun_address text,
  detail_address text,
  zonecode text,
  bcode text,
  building_name text,
  building_type text,
  area_sqm numeric,
  area_pyeong numeric,
  building_year integer,
  latitude double precision,
  longitude double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_homes_name_check check (length(trim(name)) between 1 and 60),
  constraint user_homes_road_address_check check (road_address is null or length(road_address) <= 500),
  constraint user_homes_jibun_address_check check (jibun_address is null or length(jibun_address) <= 500),
  constraint user_homes_detail_address_check check (detail_address is null or length(detail_address) <= 300),
  constraint user_homes_zonecode_check check (zonecode is null or length(zonecode) <= 20),
  constraint user_homes_bcode_check check (bcode is null or length(bcode) <= 30),
  constraint user_homes_building_name_check check (building_name is null or length(building_name) <= 200),
  constraint user_homes_building_type_check check (building_type is null or length(building_type) <= 60),
  constraint user_homes_area_sqm_check check (area_sqm is null or area_sqm > 0),
  constraint user_homes_area_pyeong_check check (area_pyeong is null or area_pyeong > 0),
  constraint user_homes_building_year_check check (
    building_year is null or building_year between 1800 and 2200
  ),
  constraint user_homes_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint user_homes_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint user_homes_coordinates_pair_check check ((latitude is null) = (longitude is null))
);

create index if not exists user_homes_user_created_idx
  on public.user_homes(user_id, created_at);

create unique index if not exists user_homes_one_default_per_user_idx
  on public.user_homes(user_id) where is_default;

create or replace function public.prepare_user_home_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception '집의 소유자는 변경할 수 없습니다.';
  end if;

  new.name := trim(new.name);
  new.road_address := nullif(trim(coalesce(new.road_address, '')), '');
  new.jibun_address := nullif(trim(coalesce(new.jibun_address, '')), '');
  new.detail_address := nullif(trim(coalesce(new.detail_address, '')), '');
  new.zonecode := nullif(trim(coalesce(new.zonecode, '')), '');
  new.bcode := nullif(trim(coalesce(new.bcode, '')), '');
  new.building_name := nullif(trim(coalesce(new.building_name, '')), '');
  new.building_type := nullif(trim(coalesce(new.building_type, '')), '');
  new.updated_at := now();

  if tg_op = 'INSERT' and not exists (
    select 1 from public.user_homes where user_id = new.user_id
  ) then
    new.is_default := true;
  end if;

  if tg_op = 'UPDATE' and old.is_default and not new.is_default
    and current_setting('app.setting_user_home_default', true) is distinct from 'true'
    and not exists (
    select 1 from public.user_homes
    where user_id = new.user_id and id <> new.id and is_default
  ) then
    new.is_default := true;
  end if;

  if new.is_default then
    perform set_config('app.setting_user_home_default', 'true', true);
    update public.user_homes
       set is_default = false, updated_at = now()
     where user_id = new.user_id and id <> new.id and is_default;
    perform set_config('app.setting_user_home_default', 'false', true);
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_user_home_write on public.user_homes;
create trigger prepare_user_home_write
before insert or update on public.user_homes
for each row execute function public.prepare_user_home_write();

create or replace function public.ensure_user_home_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.is_default then
    update public.user_homes
       set is_default = true, updated_at = now()
     where id = (
       select id from public.user_homes
        where user_id = old.user_id
        order by created_at, id
        limit 1
     );
  end if;
  return old;
end;
$$;

drop trigger if exists ensure_user_home_after_delete on public.user_homes;
create trigger ensure_user_home_after_delete
after delete on public.user_homes
for each row execute function public.ensure_user_home_after_delete();

alter table public.user_homes enable row level security;

drop policy if exists user_homes_select_own on public.user_homes;
create policy user_homes_select_own on public.user_homes
for select to authenticated using (user_id = auth.uid());

drop policy if exists user_homes_insert_own on public.user_homes;
create policy user_homes_insert_own on public.user_homes
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_homes_update_own on public.user_homes;
create policy user_homes_update_own on public.user_homes
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_homes_delete_own on public.user_homes;
create policy user_homes_delete_own on public.user_homes
for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.user_homes to authenticated;
revoke all on public.user_homes from anon;

create or replace function public.set_default_user_home(p_home_id uuid)
returns public.user_homes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result public.user_homes;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  update public.user_homes
     set is_default = true
   where id = p_home_id and user_id = auth.uid()
   returning * into result;
  if not found then raise exception '집을 찾을 수 없습니다.'; end if;
  return result;
end;
$$;

revoke all on function public.set_default_user_home(uuid) from public, anon;
grant execute on function public.set_default_user_home(uuid) to authenticated;

-- The selected home remains in the immutable analysis input for audit/history lookup.
create index if not exists as_ai_analyses_home_input_idx
  on public.as_ai_analyses ((input_payload->>'home_id'))
  where input_payload ? 'home_id';

commit;
