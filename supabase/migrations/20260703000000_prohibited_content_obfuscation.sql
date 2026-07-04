-- Tighten prohibited-content matching for common Korean obfuscations.
-- This runs in addition to the app-side guard in lib/prohibited.ts.

create or replace function public.normalize_prohibited_content_text(
  p_text text
)
returns text
language plpgsql
immutable
as $$
declare
  v_text text := regexp_replace(lower(coalesce(p_text, '')), '[^0-9a-z가-힣]+', '', 'g');
begin
  v_text := replace(v_text, '댬', '담');
  v_text := replace(v_text, '댐', '담');
  v_text := replace(v_text, '땀', '담');
  v_text := replace(v_text, '땸', '담');
  v_text := replace(v_text, '담베', '담배');
  v_text := replace(v_text, '담뱨', '담배');
  v_text := replace(v_text, '전자담베', '전자담배');
  v_text := replace(v_text, '전자댬배', '전자담배');
  v_text := replace(v_text, '전자댐배', '전자담배');
  v_text := replace(v_text, '전담', '전자담배');
  v_text := replace(v_text, '액쌍', '액상');
  v_text := replace(v_text, '액샹', '액상');
  v_text := replace(v_text, '쏘주', '소주');
  v_text := replace(v_text, '맥쥬', '맥주');

  v_text := replace(v_text, '민증', '신분증');
  v_text := replace(v_text, '주민증', '주민등록증');
  v_text := replace(v_text, '면허증', '운전면허증');
  v_text := replace(v_text, '대포통장', '통장');
  v_text := replace(v_text, '대포계좌', '계좌');

  v_text := replace(v_text, '짭퉁', '짝퉁');
  v_text := replace(v_text, '짭', '가품');
  v_text := replace(v_text, '레플', '레플리카');
  v_text := replace(v_text, '이미태이션', '이미테이션');

  v_text := replace(v_text, '대마초', '대마');
  v_text := replace(v_text, '성인물', '음란물');
  v_text := replace(v_text, '야동', '음란물');

  v_text := replace(v_text, '고냥이', '고양이');
  v_text := replace(v_text, '고냉이', '고양이');
  v_text := replace(v_text, '고앵이', '고양이');
  v_text := replace(v_text, '고먐미', '고양이');
  v_text := replace(v_text, '냐옹이', '고양이');
  v_text := replace(v_text, '야옹이', '고양이');
  v_text := replace(v_text, '댕댕이', '강아지');
  v_text := replace(v_text, '멍멍이', '강아지');
  v_text := replace(v_text, '멍뭉이', '강아지');
  v_text := replace(v_text, '강쥐', '강아지');

  return v_text;
end;
$$;

create or replace function public.prohibited_content_keywords()
returns text[]
language sql
immutable
as $$
  select array[
    '동물', '생물', '반려동물', '애완동물', '강아지', '고양이', '분양', '입양',
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
    '화약', '폭죽', '휘발유', '시너', '신나', '가스통', '위험물', '농약', '살충제',
    '총', '권총', '실탄', '도검', '칼', '석궁', '전기충격기',
    '군복', '경찰복', '소방복', '군용', '군마트', '진중문고',
    '정부지원물품', '혈액', '장기'
  ];
$$;

create or replace function public.prohibited_content_keyword_aliases()
returns text[]
language sql
immutable
as $$
  select array[
    '댬배', '댐배', '땀배', '땸배', '담베', '담뱨',
    '전담', '전자담베', '전자댬배', '전자댐배',
    '액쌍', '액샹', '니코뛴', '니코틴액상',
    '술', '알콜', '알코올', '쏘주', '맥쥬', '위스키', '보드카',
    '민증', '주민증', '면허증', '대포통장', '대포계좌',
    '아이디공유', '계정양도', '계정양수',
    '짭', '짭퉁', '레플', '이미테이션', '이미태이션',
    '처방전', '수면제', '스테로이드', '대마초', 'weed',
    '성인물', '야동',
    '고냥이', '고냉이', '고앵이', '고먐미', '냐옹이', '야옹이',
    '댕댕이', '멍멍이', '멍뭉이', '강쥐'
  ];
$$;

create or replace function public.prohibited_content_fuzzy_limit(
  p_keyword text
)
returns integer
language plpgsql
immutable
as $$
declare
  v_length integer := char_length(p_keyword);
begin
  if v_length <= 2 then
    return 0;
  end if;

  if p_keyword ~ '^[a-z0-9]+$' and v_length <= 4 then
    return 0;
  end if;

  if v_length <= 4 then
    return 1;
  end if;

  return 2;
end;
$$;

create or replace function public.prohibited_text_distance_limited(
  p_left text,
  p_right text,
  p_limit integer
)
returns integer
language plpgsql
immutable
as $$
declare
  v_left_len integer := char_length(p_left);
  v_right_len integer := char_length(p_right);
  v_previous integer[];
  v_current integer[];
  v_i integer;
  v_j integer;
  v_cost integer;
  v_distance integer;
  v_row_min integer;
begin
  if abs(v_left_len - v_right_len) > p_limit then
    return p_limit + 1;
  end if;

  if v_left_len = 0 then
    return v_right_len;
  end if;

  if v_right_len = 0 then
    return v_left_len;
  end if;

  v_previous := array[0];
  for v_j in 1..v_right_len loop
    v_previous := v_previous || v_j;
  end loop;

  for v_i in 1..v_left_len loop
    v_current := array[v_i];
    v_row_min := v_i;

    for v_j in 1..v_right_len loop
      v_cost := case
        when substring(p_left from v_i for 1) = substring(p_right from v_j for 1) then 0
        else 1
      end;

      v_distance := least(
        v_previous[v_j + 1] + 1,
        v_current[v_j] + 1,
        v_previous[v_j] + v_cost
      );

      v_current := v_current || v_distance;
      v_row_min := least(v_row_min, v_distance);
    end loop;

    if v_row_min > p_limit then
      return p_limit + 1;
    end if;

    v_previous := v_current;
  end loop;

  return v_previous[v_right_len + 1];
end;
$$;

create or replace function public.prohibited_text_contains_near(
  p_text text,
  p_keyword text,
  p_limit integer
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_text_len integer := char_length(p_text);
  v_keyword_len integer := char_length(p_keyword);
  v_start integer;
  v_length integer;
  v_min_length integer;
  v_max_length integer;
  v_candidate text;
begin
  if p_limit <= 0 then
    return false;
  end if;

  if v_text_len = 0 or v_keyword_len = 0 then
    return false;
  end if;

  v_min_length := greatest(1, v_keyword_len - p_limit);
  v_max_length := v_keyword_len + p_limit;

  for v_start in 1..v_text_len loop
    for v_length in v_min_length..v_max_length loop
      if v_start + v_length - 1 > v_text_len then
        continue;
      end if;

      v_candidate := substring(p_text from v_start for v_length);

      if public.prohibited_text_distance_limited(v_candidate, p_keyword, p_limit) <= p_limit then
        return true;
      end if;
    end loop;
  end loop;

  return false;
end;
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
  v_keywords text[] := public.prohibited_content_keywords() || public.prohibited_content_keyword_aliases();
  v_keyword text;
  v_normalized_keyword text;
  v_fuzzy_limit integer;
begin
  if v_text = '' then
    return null;
  end if;

  foreach v_keyword in array v_keywords
  loop
    v_normalized_keyword := public.normalize_prohibited_content_text(v_keyword);

    if v_normalized_keyword <> '' and v_text like '%' || v_normalized_keyword || '%' then
      return v_keyword;
    end if;
  end loop;

  foreach v_keyword in array v_keywords
  loop
    v_normalized_keyword := public.normalize_prohibited_content_text(v_keyword);
    v_fuzzy_limit := public.prohibited_content_fuzzy_limit(v_normalized_keyword);

    if
      v_normalized_keyword <> ''
      and v_fuzzy_limit > 0
      and public.prohibited_text_contains_near(v_text, v_normalized_keyword, v_fuzzy_limit)
    then
      return v_keyword;
    end if;
  end loop;

  return null;
end;
$$;

select pg_notify('pgrst', 'reload schema');
