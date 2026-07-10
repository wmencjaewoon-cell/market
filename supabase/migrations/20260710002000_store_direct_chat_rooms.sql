-- Direct chat rooms for verified stores, independent of a product listing.

alter table public.chat_rooms
  add column if not exists store_user_id uuid references public.profiles(id) on delete set null,
  alter column listing_id drop not null;

create unique index if not exists chat_rooms_direct_store_unique
on public.chat_rooms (created_by, store_user_id)
where listing_id is null
  and store_user_id is not null;

select pg_notify('pgrst', 'reload schema');
