-- Store subscription plans, local ad exposure, and server-side plan checks.
-- Safe to re-run in Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists status text not null default 'active',
  add column if not exists user_type text not null default 'personal',
  add column if not exists business_verified boolean not null default false,
  add column if not exists store_category text,
  add column if not exists representative_name text,
  add column if not exists phone text,
  add column if not exists store_address text,
  add column if not exists store_intro text,
  add column if not exists store_notice text,
  add column if not exists store_business_hours text,
  add column if not exists store_accepts_inquiries boolean not null default true,
  add column if not exists store_today_available boolean not null default false,
  add column if not exists store_card_available boolean not null default false,
  add column if not exists store_cash_receipt_available boolean not null default false,
  add column if not exists store_tax_invoice_available boolean not null default false;

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

create table if not exists public.store_subscription_plans (
  plan text primary key,
  display_name text not null,
  monthly_price_min integer not null default 0,
  monthly_price_max integer,
  product_limit integer,
  staff_limit integer,
  estimate_recent_limit integer,
  stats_recent_days integer,
  can_copy_product boolean not null default false,
  can_store_notice boolean not null default false,
  can_today_badge boolean not null default false,
  is_premium boolean not null default false,
  map_highlight boolean not null default false,
  recommended_exposure boolean not null default false,
  is_local_ad boolean not null default false,
  sort_priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Some existing projects already have this table with a different shape.
-- Add the columns explicitly before the upsert so the script is safe to run there too.
alter table public.store_subscription_plans
  add column if not exists plan text,
  add column if not exists name text,
  add column if not exists display_name text,
  add column if not exists monthly_price_min integer not null default 0,
  add column if not exists monthly_price_max integer,
  add column if not exists product_limit integer,
  add column if not exists staff_limit integer,
  add column if not exists estimate_recent_limit integer,
  add column if not exists stats_recent_days integer,
  add column if not exists can_copy_product boolean not null default false,
  add column if not exists can_store_notice boolean not null default false,
  add column if not exists can_today_badge boolean not null default false,
  add column if not exists is_premium boolean not null default false,
  add column if not exists map_highlight boolean not null default false,
  add column if not exists recommended_exposure boolean not null default false,
  add column if not exists is_local_ad boolean not null default false,
  add column if not exists sort_priority integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.store_subscription_plans
   set display_name = coalesce(display_name, plan, '기본')
 where display_name is null;

update public.store_subscription_plans
   set name = coalesce(name, display_name, plan, '기본')
 where name is null;

alter table public.store_subscription_plans
  alter column name set default '기본';

create unique index if not exists store_subscription_plans_plan_unique
on public.store_subscription_plans (plan);

do $$
declare
  v_id_type text;
begin
  select data_type
    into v_id_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'store_subscription_plans'
     and column_name = 'id';

  if v_id_type is null then
    return;
  end if;

  if v_id_type = 'uuid' then
    execute 'alter table public.store_subscription_plans alter column id set default gen_random_uuid()';
  elsif v_id_type in ('integer', 'bigint', 'smallint') then
    execute 'create sequence if not exists public.store_subscription_plans_id_seq';
    execute 'alter table public.store_subscription_plans alter column id set default nextval(''public.store_subscription_plans_id_seq''::regclass)';
  else
    execute 'alter table public.store_subscription_plans alter column id set default gen_random_uuid()::text';
  end if;
end $$;

insert into public.store_subscription_plans (
  plan,
  name,
  display_name,
  monthly_price_min,
  monthly_price_max,
  product_limit,
  staff_limit,
  estimate_recent_limit,
  stats_recent_days,
  can_copy_product,
  can_store_notice,
  can_today_badge,
  is_premium,
  map_highlight,
  recommended_exposure,
  is_local_ad,
  sort_priority
)
values
  ('free', '기본', '기본', 0, null, 10, 5, 10, 30, false, false, false, false, false, false, false, 0),
  ('basic', '베이직', '베이직', 19900, null, 20, 5, 10, 30, true, true, true, false, false, false, false, 10),
  ('premium', '프리미엄', '프리미엄', 33000, null, 50, null, null, null, true, true, true, true, true, true, false, 20),
  ('local_ad', '지역광고', '지역광고', 55000, 110000, null, null, null, null, false, false, false, false, true, true, true, 30)
on conflict (plan) do update
set
  name = excluded.name,
  display_name = excluded.display_name,
  monthly_price_min = excluded.monthly_price_min,
  monthly_price_max = excluded.monthly_price_max,
  product_limit = excluded.product_limit,
  staff_limit = excluded.staff_limit,
  estimate_recent_limit = excluded.estimate_recent_limit,
  stats_recent_days = excluded.stats_recent_days,
  can_copy_product = excluded.can_copy_product,
  can_store_notice = excluded.can_store_notice,
  can_today_badge = excluded.can_today_badge,
  is_premium = excluded.is_premium,
  map_highlight = excluded.map_highlight,
  recommended_exposure = excluded.recommended_exposure,
  is_local_ad = excluded.is_local_ad,
  sort_priority = excluded.sort_priority,
  updated_at = now();

create table if not exists public.store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null default 'free' references public.store_subscription_plans(plan),
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_subscriptions_status_check check (status in ('active', 'inactive', 'canceled', 'expired'))
);

alter table public.store_subscriptions
  add column if not exists plan text not null default 'free',
  add column if not exists status text not null default 'active',
  add column if not exists starts_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists store_subscriptions_user_id_unique
on public.store_subscriptions (user_id);

create index if not exists store_subscriptions_active_lookup_idx
on public.store_subscriptions (user_id, status, expires_at);

create table if not exists public.store_local_ads (
  id uuid primary key default gen_random_uuid(),
  store_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  region_name text,
  category text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_local_ads_status_check check (status in ('active', 'inactive', 'canceled', 'expired'))
);

create unique index if not exists store_local_ads_one_active_per_store_idx
on public.store_local_ads (store_user_id)
where status = 'active';

create index if not exists store_local_ads_active_lookup_idx
on public.store_local_ads (store_user_id, status, expires_at);

create table if not exists public.admin_logs (
  id bigserial primary key,
  admin_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action text not null,
  target_table text,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table public.store_subscription_plans enable row level security;
alter table public.store_subscriptions enable row level security;
alter table public.store_local_ads enable row level security;
alter table public.admin_logs enable row level security;

drop policy if exists store_subscription_plans_public_select on public.store_subscription_plans;
create policy store_subscription_plans_public_select
on public.store_subscription_plans
for select
to anon, authenticated
using (true);

drop policy if exists store_subscriptions_select_own_or_admin on public.store_subscriptions;
create policy store_subscriptions_select_own_or_admin
on public.store_subscriptions
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists store_subscriptions_admin_write on public.store_subscriptions;
create policy store_subscriptions_admin_write
on public.store_subscriptions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists store_local_ads_select_visible on public.store_local_ads;
create policy store_local_ads_select_visible
on public.store_local_ads
for select
to anon, authenticated
using (
  status = 'active'
  and starts_at <= now()
  and (expires_at is null or expires_at > now())
);

drop policy if exists store_local_ads_select_own_or_admin on public.store_local_ads;
create policy store_local_ads_select_own_or_admin
on public.store_local_ads
for select
to authenticated
using (store_user_id = auth.uid() or public.is_admin());

drop policy if exists store_local_ads_admin_write on public.store_local_ads;
create policy store_local_ads_admin_write
on public.store_local_ads
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_logs_admin_select on public.admin_logs;
create policy admin_logs_admin_select
on public.admin_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists admin_logs_admin_insert on public.admin_logs;
create policy admin_logs_admin_insert
on public.admin_logs
for insert
to authenticated
with check (public.is_admin());

drop view if exists public.store_public_exposure;
drop function if exists public.get_store_subscription_limits(uuid);

create or replace function public.get_store_subscription_limits(p_store_user_id uuid)
returns table (
  plan text,
  is_premium boolean,
  has_local_ad boolean,
  staff_limit integer,
  product_limit integer,
  estimate_recent_limit integer,
  stats_recent_days integer,
  can_copy_product boolean,
  can_store_notice boolean,
  can_today_badge boolean,
  map_highlight boolean,
  recommended_exposure boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_plan text;
  v_config public.store_subscription_plans%rowtype;
  v_has_local_ad boolean;
begin
  select *
    into v_profile
    from public.profiles
   where id = p_store_user_id;

  if not found then
    return query
    select 'free'::text, false, false, 5, 10, 10, 30, false, false, false, false, false;
    return;
  end if;

  select s.plan
    into v_plan
    from public.store_subscriptions s
   where s.user_id = p_store_user_id
     and s.status = 'active'
     and (s.expires_at is null or s.expires_at > now())
   order by s.created_at desc
   limit 1;

  -- During the launch event, verified stores without an explicit plan receive premium.
  if v_plan is null then
    if coalesce(v_profile.business_verified, false) and coalesce(v_profile.user_type, 'personal') = 'store' then
      v_plan := 'premium';
    else
      v_plan := 'free';
    end if;
  end if;

  if v_plan not in ('free', 'basic', 'premium') then
    v_plan := 'free';
  end if;

  select *
    into v_config
    from public.store_subscription_plans
   where store_subscription_plans.plan = v_plan;

  if not found then
    select *
      into v_config
      from public.store_subscription_plans
     where store_subscription_plans.plan = 'free';
  end if;

  select exists (
    select 1
      from public.store_local_ads ad
     where ad.store_user_id = p_store_user_id
       and ad.status = 'active'
       and ad.starts_at <= now()
       and (ad.expires_at is null or ad.expires_at > now())
  )
    into v_has_local_ad;

  return query
  select
    v_plan,
    coalesce(v_config.is_premium, false),
    coalesce(v_has_local_ad, false),
    v_config.staff_limit,
    coalesce(v_config.product_limit, 10),
    v_config.estimate_recent_limit,
    v_config.stats_recent_days,
    coalesce(v_config.can_copy_product, false),
    coalesce(v_config.can_store_notice, false),
    coalesce(v_config.can_today_badge, false),
    coalesce(v_config.map_highlight, false) or coalesce(v_has_local_ad, false),
    coalesce(v_config.recommended_exposure, false) or coalesce(v_has_local_ad, false);
end;
$$;

revoke all on function public.get_store_subscription_limits(uuid) from public;
grant execute on function public.get_store_subscription_limits(uuid) to authenticated;

drop function if exists public.admin_set_store_subscription(uuid, text, text, timestamptz);

create or replace function public.admin_set_store_subscription(
  p_store_user_id uuid,
  p_plan text,
  p_status text default 'active',
  p_expires_at timestamptz default null
)
returns public.store_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.store_subscriptions%rowtype;
begin
  if not public.is_admin() then
    raise exception '관리자만 가게 요금제를 변경할 수 있습니다.';
  end if;

  if p_plan not in ('free', 'basic', 'premium') then
    raise exception '지원하지 않는 가게 요금제입니다.';
  end if;

  if p_status not in ('active', 'inactive', 'canceled', 'expired') then
    raise exception '지원하지 않는 구독 상태입니다.';
  end if;

  if not exists (
    select 1
      from public.profiles p
     where p.id = p_store_user_id
       and p.user_type = 'store'
       and coalesce(p.business_verified, false)
  ) then
    raise exception '가게 인증 완료 계정에만 요금제를 적용할 수 있습니다.';
  end if;

  insert into public.store_subscriptions (
    user_id,
    plan,
    status,
    expires_at,
    updated_at
  )
  values (
    p_store_user_id,
    p_plan,
    p_status,
    p_expires_at,
    now()
  )
  on conflict (user_id) do update
  set
    plan = excluded.plan,
    status = excluded.status,
    expires_at = excluded.expires_at,
    updated_at = now()
  returning * into v_row;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_set_store_subscription',
    'store_subscriptions',
    p_store_user_id::text,
    jsonb_build_object('plan', p_plan, 'status', p_status, 'expires_at', p_expires_at)
  );

  return v_row;
end;
$$;

revoke all on function public.admin_set_store_subscription(uuid, text, text, timestamptz) from public;
grant execute on function public.admin_set_store_subscription(uuid, text, text, timestamptz) to authenticated;

drop function if exists public.admin_set_store_local_ad(uuid, text, text, text, timestamptz);

create or replace function public.admin_set_store_local_ad(
  p_store_user_id uuid,
  p_status text default 'active',
  p_region_name text default null,
  p_category text default null,
  p_expires_at timestamptz default null
)
returns public.store_local_ads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.store_local_ads%rowtype;
begin
  if not public.is_admin() then
    raise exception '관리자만 지역광고를 변경할 수 있습니다.';
  end if;

  if p_status not in ('active', 'inactive', 'canceled', 'expired') then
    raise exception '지원하지 않는 지역광고 상태입니다.';
  end if;

  if not exists (
    select 1
      from public.profiles p
     where p.id = p_store_user_id
       and p.user_type = 'store'
       and coalesce(p.business_verified, false)
  ) then
    raise exception '가게 인증 완료 계정에만 지역광고를 적용할 수 있습니다.';
  end if;

  update public.store_local_ads
     set status = p_status,
         region_name = p_region_name,
         category = p_category,
         expires_at = p_expires_at,
         updated_at = now()
   where store_user_id = p_store_user_id
     and status = 'active'
   returning * into v_row;

  if not found then
    insert into public.store_local_ads (
      store_user_id,
      status,
      region_name,
      category,
      expires_at,
      updated_at
    )
    values (
      p_store_user_id,
      p_status,
      p_region_name,
      p_category,
      p_expires_at,
      now()
    )
    returning * into v_row;
  end if;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_set_store_local_ad',
    'store_local_ads',
    p_store_user_id::text,
    jsonb_build_object('status', p_status, 'region_name', p_region_name, 'category', p_category, 'expires_at', p_expires_at)
  );

  return v_row;
end;
$$;

revoke all on function public.admin_set_store_local_ad(uuid, text, text, text, timestamptz) from public;
grant execute on function public.admin_set_store_local_ad(uuid, text, text, text, timestamptz) to authenticated;

drop function if exists public.update_store_profile_settings(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);

create or replace function public.update_store_profile_settings(
  p_store_user_id uuid,
  p_store_category text,
  p_representative_name text,
  p_phone text,
  p_store_address text,
  p_store_intro text,
  p_store_notice text,
  p_store_business_hours text,
  p_store_accepts_inquiries boolean,
  p_store_today_available boolean,
  p_store_card_available boolean,
  p_store_cash_receipt_available boolean,
  p_store_tax_invoice_available boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_limits record;
  v_can_manage boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select *
    into v_profile
    from public.profiles
   where id = p_store_user_id;

  if not found then
    raise exception '가게를 찾을 수 없습니다.';
  end if;

  v_can_manage := auth.uid() = p_store_user_id or public.is_admin();

  if not v_can_manage and to_regclass('public.store_staff_members') is not null then
    execute '
      select exists (
        select 1
          from public.store_staff_members
         where store_user_id = $1
           and staff_user_id = $2
           and coalesce(status, ''active'') = ''active''
           and coalesce(role, ''staff'') in (''owner'', ''manager'')
      )'
      into v_can_manage
      using p_store_user_id, auth.uid();
  end if;

  if not v_can_manage then
    raise exception '가게 대표 또는 매니저만 가게 프로필을 수정할 수 있습니다.';
  end if;

  if coalesce(v_profile.user_type, 'personal') <> 'store'
     or not coalesce(v_profile.business_verified, false) then
    raise exception '가게 인증 완료 계정만 가게 프로필을 수정할 수 있습니다.';
  end if;

  select *
    into v_limits
    from public.get_store_subscription_limits(p_store_user_id)
   limit 1;

  update public.profiles
     set store_category = nullif(trim(p_store_category), ''),
         representative_name = nullif(trim(p_representative_name), ''),
         phone = nullif(trim(p_phone), ''),
         store_address = nullif(trim(p_store_address), ''),
         store_intro = nullif(trim(p_store_intro), ''),
         store_notice = case
           when coalesce(v_limits.can_store_notice, false) then nullif(trim(p_store_notice), '')
           else null
         end,
         store_business_hours = nullif(trim(p_store_business_hours), ''),
         store_accepts_inquiries = coalesce(p_store_accepts_inquiries, true),
         store_today_available = case
           when coalesce(v_limits.can_today_badge, false) then coalesce(p_store_today_available, false)
           else false
         end,
         store_card_available = coalesce(p_store_card_available, false),
         store_cash_receipt_available = coalesce(p_store_cash_receipt_available, false),
         store_tax_invoice_available = coalesce(p_store_tax_invoice_available, false)
   where id = p_store_user_id
   returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.update_store_profile_settings(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) from public;
grant execute on function public.update_store_profile_settings(
  uuid,
  text,
  text,
  text,
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

create or replace function public.enforce_store_listing_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_user_id uuid;
  v_limits record;
  v_current_count integer;
begin
  if coalesce(new.seller_type, 'personal') <> 'store'
     and new.store_user_id is null then
    return new;
  end if;

  v_store_user_id := coalesce(new.store_user_id, new.author_id);

  if v_store_user_id is null then
    return new;
  end if;

  select *
    into v_limits
    from public.get_store_subscription_limits(v_store_user_id)
   limit 1;

  if not coalesce(v_limits.can_today_badge, false) then
    new.available_today := false;
    new.available_now := false;
  end if;

  if tg_op = 'INSERT' and coalesce(new.status, 'active') <> 'delete_pending' then
    select count(*)
      into v_current_count
      from public.listings l
     where l.store_user_id = v_store_user_id
       and coalesce(l.seller_type, 'personal') = 'store'
       and coalesce(l.status, 'active') <> 'delete_pending';

    if v_current_count >= coalesce(v_limits.product_limit, 10) then
      raise exception '현재 % 플랜에서는 상품 등록이 %개까지 가능합니다.',
        coalesce(v_limits.plan, 'free'),
        coalesce(v_limits.product_limit, 10);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_store_listing_plan_limits on public.listings;
create trigger enforce_store_listing_plan_limits
before insert or update on public.listings
for each row
execute function public.enforce_store_listing_plan_limits();

revoke all on function public.enforce_store_listing_plan_limits() from public;

create or replace view public.store_public_exposure as
select
  p.id as store_user_id,
  limits.is_premium,
  limits.map_highlight,
  limits.recommended_exposure,
  limits.has_local_ad,
  limits.plan as store_subscription_plan,
  'active'::text as store_subscription_status
from public.profiles p
join lateral public.get_store_subscription_limits(p.id) limits on true
where p.user_type = 'store'
  and coalesce(p.business_verified, false)
  and coalesce(p.status, 'active') = 'active';

grant select on public.store_subscription_plans to anon, authenticated;
grant select on public.store_public_exposure to anon, authenticated;
grant select on public.store_subscriptions to authenticated;
grant select on public.store_local_ads to anon, authenticated;

notify pgrst, 'reload schema';
