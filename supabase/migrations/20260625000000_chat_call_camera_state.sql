-- Track per-participant camera-off state so the remote UI can show a black screen.

alter table public.chat_call_sessions
  add column if not exists caller_camera_off boolean not null default false,
  add column if not exists callee_camera_off boolean not null default false;
