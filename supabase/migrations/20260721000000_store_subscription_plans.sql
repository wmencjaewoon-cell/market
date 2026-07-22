-- Store subscription plan catalog and separate local advertising subscriptions.

create extension if not exists pgcrypto;

create table if not exists public.store_subscription_plans (
  id text primary key,
  plan_type text not null default 'membership',
  name text not null,
  short_description text,
  monthly_price_min integer not null default 0,
  monthly_price_max integer,
  currency text not null default 'KRW',
  product_limit integer,
  is_separately_sold boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  features jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_subscription_plans
  drop constraint if exists store_subscription_plans_plan_type_check;

alter table public.store_subscription_plans
  add constraint store_subscription_plans_plan_type_check
  check (plan_type in ('membership', 'advertising', 'legacy'));

alter table public.store_subscription_plans
  drop constraint if exists store_subscription_plans_price_check;

alter table public.store_subscription_plans
  add constraint store_subscription_plans_price_check
  check (
    monthly_price_min >= 0
    and (
      monthly_price_max is null
      or monthly_price_max >= monthly_price_min
    )
  );

alter table public.store_subscription_plans
  drop constraint if exists store_subscription_plans_product_limit_check;

alter table public.store_subscription_plans
  add constraint store_subscription_plans_product_limit_check
  check (product_limit is null or product_limit >= 0);

alter table public.store_subscription_plans
  drop constraint if exists store_subscription_plans_json_check;

alter table public.store_subscription_plans
  add constraint store_subscription_plans_json_check
  check (
    jsonb_typeof(features) = 'array'
    and jsonb_typeof(metadata) = 'object'
  );

create index if not exists store_subscription_plans_type_sort_idx
on public.store_subscription_plans (plan_type, sort_order);

insert into public.store_subscription_plans (
  id,
  plan_type,
  name,
  short_description,
  monthly_price_min,
  monthly_price_max,
  currency,
  product_limit,
  is_separately_sold,
  sort_order,
  is_active,
  features,
  metadata
)
values
(
  'free',
  'membership',
  '무료 가게',
  '가게들이 부담 없이 입점할 수 있는 기본 플랜입니다.',
  0,
  null,
  'KRW',
  5,
  false,
  10,
  true,
  $$[
    { "key": "product_limit", "label": "상품 5개 등록" },
    { "key": "basic_store_profile", "label": "기본 가게 프로필" },
    { "key": "basic_map_exposure", "label": "기본 지도 노출" },
    { "key": "chat_inquiries", "label": "채팅 문의 가능" }
  ]$$::jsonb,
  $${
    "billing_cycle": "monthly",
    "positioning": "무료가 있어야 가게들이 부담 없이 들어옵니다."
  }$$::jsonb
),
(
  'basic',
  'membership',
  '베이직 플랜',
  '상품을 조금 많이 올리는 가게용 플랜입니다.',
  19900,
  null,
  'KRW',
  20,
  false,
  20,
  true,
  $$[
    { "key": "product_limit", "label": "상품 20개 등록" },
    { "key": "duplicate_products", "label": "상품 복사 등록" },
    { "key": "store_notice", "label": "가게 공지 등록" },
    { "key": "today_available_badge", "label": "오늘 가능 배지" },
    { "key": "basic_inquiry_stats", "label": "기본 문의 통계" }
  ]$$::jsonb,
  $${
    "billing_cycle": "monthly",
    "positioning": "상품을 조금 많이 올리는 가게용입니다."
  }$$::jsonb
),
(
  'premium',
  'membership',
  '프리미엄 플랜',
  '문의 1건의 가치로 부담 없이 쓸 수 있는 상위 노출 플랜입니다.',
  33000,
  null,
  'KRW',
  50,
  false,
  30,
  true,
  $$[
    { "key": "product_limit", "label": "상품 50개 등록" },
    { "key": "recommended_store_exposure", "label": "추천 가게 노출" },
    { "key": "highlighted_map_marker", "label": "지도 강조 마커" },
    { "key": "prominent_today_available_badge", "label": "오늘 가능 배지 강조" },
    { "key": "detailed_inquiry_stats", "label": "상세 문의 통계" },
    { "key": "duplicate_products", "label": "상품 복사 등록" },
    { "key": "pinned_store_notice", "label": "가게 공지 상단 표시" },
    { "key": "priority_urgent_material_alert", "label": "긴급 자재 요청 우선 알림" }
  ]$$::jsonb,
  $${
    "billing_cycle": "monthly",
    "positioning": "문의 1건만 제대로 와도 낼 수 있는 가격입니다."
  }$$::jsonb
),
(
  'local_ad',
  'advertising',
  '지역광고 플랜',
  '프리미엄과 별도로 판매하는 지역 노출 광고입니다.',
  55000,
  110000,
  'KRW',
  null,
  true,
  40,
  true,
  $$[
    { "key": "region_home_top_exposure", "label": "지역 홈 상단 노출" },
    { "key": "category_top_exposure", "label": "카테고리 상단 노출" },
    { "key": "fixed_recommended_store", "label": "추천 가게 고정" },
    { "key": "highlighted_map_marker", "label": "지도 강조 표시" },
    { "key": "monthly_inquiry_report", "label": "월간 문의 리포트" }
  ]$$::jsonb,
  $${
    "billing_cycle": "monthly",
    "is_add_on": true,
    "separate_from_membership": true
  }$$::jsonb
),
(
  'partner',
  'legacy',
  '파트너 플랜',
  '기존 데이터 호환을 위해 유지하는 비노출 플랜입니다.',
  0,
  null,
  'KRW',
  null,
  false,
  90,
  false,
  '[]'::jsonb,
  '{ "legacy": true }'::jsonb
)
on conflict (id) do update
set
  plan_type = excluded.plan_type,
  name = excluded.name,
  short_description = excluded.short_description,
  monthly_price_min = excluded.monthly_price_min,
  monthly_price_max = excluded.monthly_price_max,
  currency = excluded.currency,
  product_limit = excluded.product_limit,
  is_separately_sold = excluded.is_separately_sold,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  features = excluded.features,
  metadata = excluded.metadata,
  updated_at = now();

alter table public.store_subscription_plans enable row level security;

drop policy if exists store_subscription_plans_select_active on public.store_subscription_plans;
create policy store_subscription_plans_select_active
on public.store_subscription_plans
for select
to anon, authenticated
using (is_active);

drop policy if exists store_subscription_plans_admin_all on public.store_subscription_plans;
create policy store_subscription_plans_admin_all
on public.store_subscription_plans
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table public.store_subscriptions
  add column if not exists price_amount integer,
  add column if not exists currency text not null default 'KRW',
  add column if not exists billing_cycle text not null default 'monthly',
  add column if not exists auto_renew boolean not null default true,
  add column if not exists canceled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.store_subscriptions
  drop constraint if exists store_subscriptions_plan_check;

alter table public.store_subscriptions
  add constraint store_subscriptions_plan_check
  check (plan in ('free', 'basic', 'premium', 'local_ad', 'partner'));

alter table public.store_subscriptions
  drop constraint if exists store_subscriptions_status_check;

alter table public.store_subscriptions
  add constraint store_subscriptions_status_check
  check (status in ('active', 'expired', 'canceled'));

alter table public.store_subscriptions
  drop constraint if exists store_subscriptions_price_check;

alter table public.store_subscriptions
  add constraint store_subscriptions_price_check
  check (price_amount is null or price_amount >= 0);

alter table public.store_subscriptions
  drop constraint if exists store_subscriptions_billing_cycle_check;

alter table public.store_subscriptions
  add constraint store_subscriptions_billing_cycle_check
  check (billing_cycle in ('monthly', 'yearly', 'manual'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.store_subscriptions'::regclass
      and conname = 'store_subscriptions_plan_fk'
  ) then
    alter table public.store_subscriptions
      add constraint store_subscriptions_plan_fk
      foreign key (plan)
      references public.store_subscription_plans(id)
      on update cascade;
  end if;
end $$;

create index if not exists store_subscriptions_plan_status_idx
on public.store_subscriptions (plan, status);

update public.store_subscriptions s
set
  price_amount = coalesce(s.price_amount, p.monthly_price_min),
  currency = coalesce(nullif(s.currency, ''), p.currency),
  billing_cycle = coalesce(nullif(s.billing_cycle, ''), 'monthly'),
  updated_at = now()
from public.store_subscription_plans p
where s.plan = p.id
  and (
    s.price_amount is null
    or nullif(s.currency, '') is null
    or nullif(s.billing_cycle, '') is null
  );

drop policy if exists store_subscriptions_select_own_or_admin on public.store_subscriptions;
create policy store_subscriptions_select_own_or_admin
on public.store_subscriptions
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin()
  or public.is_active_store_manager(user_id, auth.uid())
);

drop policy if exists store_subscriptions_admin_all on public.store_subscriptions;
create policy store_subscriptions_admin_all
on public.store_subscriptions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.store_ad_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null default 'local_ad' references public.store_subscription_plans(id) on update cascade,
  status text not null default 'active',
  ad_region text,
  ad_category text,
  price_amount integer not null,
  currency text not null default 'KRW',
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_ad_subscriptions
  drop constraint if exists store_ad_subscriptions_plan_check;

alter table public.store_ad_subscriptions
  add constraint store_ad_subscriptions_plan_check
  check (plan_id = 'local_ad');

alter table public.store_ad_subscriptions
  drop constraint if exists store_ad_subscriptions_status_check;

alter table public.store_ad_subscriptions
  add constraint store_ad_subscriptions_status_check
  check (status in ('pending', 'active', 'expired', 'canceled'));

alter table public.store_ad_subscriptions
  drop constraint if exists store_ad_subscriptions_price_check;

alter table public.store_ad_subscriptions
  add constraint store_ad_subscriptions_price_check
  check (price_amount between 55000 and 110000);

create index if not exists store_ad_subscriptions_store_status_idx
on public.store_ad_subscriptions (store_user_id, status, created_at desc);

create index if not exists store_ad_subscriptions_target_idx
on public.store_ad_subscriptions (ad_region, ad_category, status);

alter table public.store_ad_subscriptions enable row level security;

drop policy if exists store_ad_subscriptions_select_related on public.store_ad_subscriptions;
create policy store_ad_subscriptions_select_related
on public.store_ad_subscriptions
for select
to authenticated
using (
  auth.uid() = store_user_id
  or public.is_admin()
  or public.is_active_store_manager(store_user_id, auth.uid())
);

drop policy if exists store_ad_subscriptions_admin_all on public.store_ad_subscriptions;
create policy store_ad_subscriptions_admin_all
on public.store_ad_subscriptions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.set_store_subscription_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists store_subscription_plans_set_updated_at on public.store_subscription_plans;
create trigger store_subscription_plans_set_updated_at
before update on public.store_subscription_plans
for each row execute function public.set_store_subscription_updated_at();

drop trigger if exists store_subscriptions_set_updated_at on public.store_subscriptions;
create trigger store_subscriptions_set_updated_at
before update on public.store_subscriptions
for each row execute function public.set_store_subscription_updated_at();

drop trigger if exists store_ad_subscriptions_set_updated_at on public.store_ad_subscriptions;
create trigger store_ad_subscriptions_set_updated_at
before update on public.store_ad_subscriptions
for each row execute function public.set_store_subscription_updated_at();

create or replace function public.ensure_free_store_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_type = 'store'
     and coalesce(new.business_verified, false)
     and coalesce(new.status, 'active') = 'active' then
    insert into public.store_subscriptions (
      user_id,
      plan,
      status,
      started_at,
      price_amount,
      currency,
      billing_cycle,
      auto_renew
    )
    values (
      new.id,
      'free',
      'active',
      now(),
      0,
      'KRW',
      'monthly',
      false
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_ensure_free_store_subscription on public.profiles;
create trigger profiles_ensure_free_store_subscription
after insert or update of user_type, business_verified, status
on public.profiles
for each row execute function public.ensure_free_store_subscription();

insert into public.store_subscriptions (
  user_id,
  plan,
  status,
  started_at,
  price_amount,
  currency,
  billing_cycle,
  auto_renew
)
select
  p.id,
  'free',
  'active',
  now(),
  0,
  'KRW',
  'monthly',
  false
from public.profiles p
where p.user_type = 'store'
  and coalesce(p.business_verified, false)
  and coalesce(p.status, 'active') = 'active'
on conflict (user_id) do nothing;

grant select on public.store_subscription_plans to anon, authenticated;
grant select, insert, update, delete on public.store_subscription_plans to authenticated;
grant select, insert, update, delete on public.store_subscriptions to authenticated;
grant select, insert, update, delete on public.store_ad_subscriptions to authenticated;

select pg_notify('pgrst', 'reload schema');
