alter table public.profiles
  add column if not exists store_address text,
  add column if not exists store_latitude double precision,
  add column if not exists store_longitude double precision;

select pg_notify('pgrst', 'reload schema');
