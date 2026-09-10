-- Listing bump / UP feature.
-- Owners can move an active listing up once per Korea calendar day.

alter table public.listings
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_bumped_at timestamptz;

create index if not exists listings_active_bumped_sort_idx
on public.listings (
  status,
  last_bumped_at desc nulls last,
  created_at desc
);

create or replace function public.bump_listing_once_per_day(p_listing_id bigint)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select *
    into v_listing
    from public.listings
   where id = p_listing_id
   for update;

  if not found then
    raise exception '게시글을 찾을 수 없습니다.';
  end if;

  if v_listing.author_id is distinct from auth.uid() then
    raise exception '본인 게시글만 UP할 수 있습니다.';
  end if;

  if coalesce(v_listing.status, 'active') <> 'active' then
    raise exception '거래중 게시글만 UP할 수 있습니다.';
  end if;

  if v_listing.last_bumped_at is not null
     and (v_listing.last_bumped_at at time zone 'Asia/Seoul')::date =
         (v_now at time zone 'Asia/Seoul')::date then
    raise exception 'UP하기는 하루에 한 번만 가능합니다.';
  end if;

  update public.listings
     set last_bumped_at = v_now,
         updated_at = v_now
   where id = p_listing_id
   returning * into v_listing;

  return v_listing;
end;
$$;

revoke all on function public.bump_listing_once_per_day(bigint) from public;
grant execute on function public.bump_listing_once_per_day(bigint) to authenticated;
