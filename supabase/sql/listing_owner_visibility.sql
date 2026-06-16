-- Owner controlled listing visibility.
-- Allows restoring a hidden listing to the status it had before the owner hid it.

alter table public.listings
  add column if not exists listing_hidden_previous_status text;
