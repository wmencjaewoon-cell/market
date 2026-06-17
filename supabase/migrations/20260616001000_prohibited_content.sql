-- Prohibited content guard for listings and sale completion.
-- Keep this keyword list in sync with lib/prohibited.ts.

create or replace function public.normalize_prohibited_content_text(
  p_text text
)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(p_text, '')), '[^0-9a-z가-힣]+', '', 'g');
$$;

create or replace function public.prohibited_content_keywords()
returns text[]
language sql
immutable
as $$
  select array[
    '동물', '강아지', '고양이', '분양', '입양',
    '담배', '전자담배', '액상', '니코틴',
    '주류', '소주', '맥주', '와인', '양주',
    '신분증', '주민등록증', '운전면허증', '여권',
    '통장', '계좌', '신용카드', '카드번호',
    '개인정보', '명의대여',
    '계정판매', '계정거래', '아이디판매', '아이디거래', '계정공유',
    '가품', '짝퉁', '레플리카', '위조', '상표권침해',
    '불법복제', '해킹', '도박',
    '의약품', '처방약', '전문의약품', '항생제',
    '의료기기', '콘택트렌즈', '렌즈', '도수안경',
    '마약', '대마', '필로폰',
    '청소년유해약물', '청소년유해매체물',
    '음란물',
    '티켓양도금지', '거래금지티켓',
    '거래금지식품', '거래금지화장품',
    '화약', '폭죽', '휘발유', '시너', '가스통', '위험물', '농약', '살충제',
    '총', '권총', '실탄', '도검', '칼', '석궁', '전기충격기',
    '군복', '경찰복', '소방복', '군용', '군마트', '진중문고',
    '정부지원물품', '혈액', '장기'
  ];
$$;

create or replace function public.find_prohibited_content_keyword(
  p_values text[]
)
returns text
language plpgsql
immutable
as $$
declare
  v_text text := public.normalize_prohibited_content_text(array_to_string(p_values, ' '));
  v_keyword text;
begin
  if v_text = '' then
    return null;
  end if;

  foreach v_keyword in array public.prohibited_content_keywords()
  loop
    if v_text like '%' || public.normalize_prohibited_content_text(v_keyword) || '%' then
      return v_keyword;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.enforce_listing_prohibited_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keyword text;
  v_content_changed boolean := true;
  v_sale_change boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_content_changed :=
      new.title is distinct from old.title
      or new.price_text is distinct from old.price_text
      or new.description is distinct from old.description
      or new.detail_location is distinct from old.detail_location;

    v_sale_change :=
      coalesce(new.quantity_sold, 0) > coalesce(old.quantity_sold, 0)
      or (new.status = 'done' and new.status is distinct from old.status);

    if not v_content_changed and not v_sale_change then
      return new;
    end if;
  end if;

  v_keyword := public.find_prohibited_content_keyword(array[
    new.title,
    new.price_text,
    new.description,
    new.detail_location
  ]);

  if v_keyword is not null then
    raise exception using message =
      format('"%s" 관련 판매금지 물품은 등록하거나 판매할 수 없습니다.', v_keyword);
  end if;

  return new;
end;
$$;

create or replace function public.enforce_listing_sale_prohibited_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
  v_keyword text;
begin
  select *
  into v_listing
  from public.listings
  where id = new.listing_id;

  if not found then
    return new;
  end if;

  v_keyword := public.find_prohibited_content_keyword(array[
    v_listing.title,
    v_listing.price_text,
    v_listing.description,
    v_listing.detail_location
  ]);

  if v_keyword is not null then
    raise exception using message =
      format('"%s" 관련 판매금지 물품은 판매 처리할 수 없습니다.', v_keyword);
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.listings') is not null then
    execute 'drop trigger if exists listings_prohibited_content_before_insert on public.listings';
    execute 'create trigger listings_prohibited_content_before_insert before insert on public.listings for each row execute function public.enforce_listing_prohibited_content()';

    execute 'drop trigger if exists listings_prohibited_content_before_update on public.listings';
    execute 'create trigger listings_prohibited_content_before_update before update on public.listings for each row execute function public.enforce_listing_prohibited_content()';
  end if;

  if to_regclass('public.listing_sales') is not null then
    execute 'drop trigger if exists listing_sales_prohibited_content_before_insert on public.listing_sales';
    execute 'create trigger listing_sales_prohibited_content_before_insert before insert on public.listing_sales for each row execute function public.enforce_listing_sale_prohibited_content()';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
