-- Run this in Supabase SQL Editor before using quantity-based listing sales.

alter table public.listings
  add column if not exists quantity_total integer not null default 1,
  add column if not exists quantity_remaining integer not null default 1,
  add column if not exists quantity_sold integer not null default 0;

update public.listings
set
  quantity_total = greatest(coalesce(quantity_total, 1), 1),
  quantity_remaining = case
    when status = 'done' then 0
    else greatest(coalesce(quantity_remaining, 1), 1)
  end,
  quantity_sold = case
    when status = 'done' then greatest(coalesce(quantity_total, 1), 1)
    else greatest(coalesce(quantity_sold, 0), 0)
  end;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'listings_quantity_total_positive'
  ) then
    alter table public.listings
      add constraint listings_quantity_total_positive check (quantity_total > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'listings_quantity_remaining_nonnegative'
  ) then
    alter table public.listings
      add constraint listings_quantity_remaining_nonnegative check (quantity_remaining >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'listings_quantity_sold_nonnegative'
  ) then
    alter table public.listings
      add constraint listings_quantity_sold_nonnegative check (quantity_sold >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'listings_quantity_consistent'
  ) then
    alter table public.listings
      add constraint listings_quantity_consistent
      check (quantity_remaining + quantity_sold <= quantity_total);
  end if;
end $$;

create table if not exists public.listing_sales (
  id bigserial primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid references public.chat_rooms(id) on delete set null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

alter table public.listing_sales
  add column if not exists quantity integer;

update public.listing_sales
set quantity = 1
where quantity is null;

alter table public.listing_sales
  alter column quantity set default 1,
  alter column quantity set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'listing_sales_quantity_positive'
  ) then
    alter table public.listing_sales
      add constraint listing_sales_quantity_positive check (quantity > 0);
  end if;
end $$;

alter table public.listing_sales enable row level security;

drop policy if exists listing_sales_select_participants on public.listing_sales;
create policy listing_sales_select_participants
on public.listing_sales
for select
using (seller_id = auth.uid() or buyer_id = auth.uid());

drop policy if exists listing_sales_insert_seller on public.listing_sales;
create policy listing_sales_insert_seller
on public.listing_sales
for insert
with check (seller_id = auth.uid());

create or replace function public.complete_listing_sale(
  p_listing_id bigint,
  p_buyer_id uuid,
  p_quantity integer,
  p_room_id uuid default null
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
  v_remaining integer;
begin
  select *
  into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'Listing not found';
  end if;

  if auth.uid() is null or auth.uid() <> v_listing.author_id then
    raise exception 'Only the listing owner can complete a sale';
  end if;

  if p_buyer_id is null then
    raise exception 'Buyer is required';
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception 'Sale quantity must be at least 1';
  end if;

  v_remaining := coalesce(v_listing.quantity_remaining, 1);

  if v_remaining < p_quantity then
    raise exception 'Not enough quantity remaining';
  end if;

  update public.listings
  set
    quantity_remaining = v_remaining - p_quantity,
    quantity_sold = coalesce(quantity_sold, 0) + p_quantity,
    status = case when v_remaining - p_quantity <= 0 then 'done' else 'active' end,
    buyer_id = p_buyer_id
  where id = p_listing_id
  returning * into v_listing;

  insert into public.listing_sales (
    listing_id,
    seller_id,
    buyer_id,
    room_id,
    quantity
  )
  values (
    p_listing_id,
    v_listing.author_id,
    p_buyer_id,
    p_room_id,
    p_quantity
  );

  return v_listing;
end;
$$;

grant select, insert on public.listing_sales to authenticated;
grant usage, select on sequence public.listing_sales_id_seq to authenticated;
grant execute on function public.complete_listing_sale(bigint, uuid, integer, uuid) to authenticated;

alter table public.reviews
  add column if not exists sale_id bigint references public.listing_sales(id) on delete set null;

alter table public.reviews
  drop constraint if exists reviews_listing_id_reviewer_id_target_user_id_key;

drop index if exists public.reviews_listing_id_reviewer_id_target_user_id_key;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'reviews'
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by a.attname)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
      ) = array['listing_id', 'reviewer_id', 'target_user_id']
  loop
    execute format('alter table public.reviews drop constraint %I', r.conname);
  end loop;

  for r in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'reviews'
      and indexdef ilike 'create unique index%'
      and indexdef ilike '%listing_id%'
      and indexdef ilike '%reviewer_id%'
      and indexdef ilike '%target_user_id%'
      and indexdef not ilike '%sale_id%'
  loop
    execute format('drop index if exists public.%I', r.indexname);
  end loop;
end $$;

create unique index if not exists reviews_unique_sale_participant
on public.reviews (sale_id, reviewer_id, target_user_id)
where sale_id is not null;

create unique index if not exists reviews_unique_legacy_listing_participant
on public.reviews (listing_id, reviewer_id, target_user_id)
where sale_id is null;

select pg_notify('pgrst', 'reload schema');
