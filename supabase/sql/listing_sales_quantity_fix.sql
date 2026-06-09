-- Fix existing listing_sales tables that were created before quantity support.
-- Run this in Supabase SQL Editor if purchases show:
-- column listing_sales.quantity does not exist

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

notify pgrst, 'reload schema';
