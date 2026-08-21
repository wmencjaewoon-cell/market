-- Store per-user hidden state for chat rooms.

alter table if exists public.chat_room_settings
  add column if not exists hidden boolean not null default false;

create index if not exists chat_room_settings_user_hidden_idx
  on public.chat_room_settings (user_id, hidden);
