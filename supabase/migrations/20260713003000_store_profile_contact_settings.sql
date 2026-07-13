-- Editable store contact fields for verified store profiles.

alter table public.profiles
  add column if not exists representative_name text;

drop function if exists public.update_store_profile_settings(
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
);

drop function if exists public.update_store_profile_settings(
  uuid,
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
  p_store_category text default null,
  p_representative_name text default null,
  p_phone text default null,
  p_store_address text default null,
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

  if length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) < 8 then
    raise exception '가게 전화번호를 입력해 주세요.';
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
    representative_name = nullif(trim(coalesce(p_representative_name, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    is_phone_public = true,
    store_address = nullif(trim(coalesce(p_store_address, '')), ''),
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
