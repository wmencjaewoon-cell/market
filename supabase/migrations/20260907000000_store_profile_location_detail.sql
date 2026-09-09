-- Store profile map location and detail address
-- Safe to run more than once.

alter table public.profiles
  add column if not exists store_detail_address text,
  add column if not exists store_latitude double precision,
  add column if not exists store_longitude double precision;

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
  boolean,
  text,
  double precision,
  double precision
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
  p_store_tax_invoice_available boolean,
  p_store_detail_address text default null,
  p_store_latitude double precision default null,
  p_store_longitude double precision default null
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
         store_detail_address = nullif(trim(coalesce(p_store_detail_address, '')), ''),
         store_latitude = p_store_latitude,
         store_longitude = p_store_longitude,
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
  boolean,
  text,
  double precision,
  double precision
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
  boolean,
  text,
  double precision,
  double precision
) to authenticated;
