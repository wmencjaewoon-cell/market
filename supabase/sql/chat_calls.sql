-- Chat call request sessions.
-- This stores call invitations and accept/decline/end state for chat rooms.

create extension if not exists pgcrypto;

create table if not exists public.chat_call_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  call_type text not null check (call_type in ('voice', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'canceled', 'ended', 'missed')),
  offer jsonb,
  answer jsonb,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);

alter table public.chat_call_sessions
  add column if not exists offer jsonb,
  add column if not exists answer jsonb;

create index if not exists chat_call_sessions_room_status_idx
on public.chat_call_sessions (room_id, status, created_at desc);

create index if not exists chat_call_sessions_callee_status_idx
on public.chat_call_sessions (callee_id, status, created_at desc);

alter table public.chat_call_sessions enable row level security;

drop policy if exists chat_call_sessions_select_participants on public.chat_call_sessions;
create policy chat_call_sessions_select_participants
on public.chat_call_sessions
for select
using (caller_id = auth.uid() or callee_id = auth.uid());

drop policy if exists chat_call_sessions_insert_caller on public.chat_call_sessions;
create policy chat_call_sessions_insert_caller
on public.chat_call_sessions
for insert
with check (
  caller_id = auth.uid()
  and callee_id <> auth.uid()
  and exists (
    select 1
    from public.chat_room_members m
    where m.room_id = chat_call_sessions.room_id
      and m.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.chat_room_members m
    where m.room_id = chat_call_sessions.room_id
      and m.user_id = chat_call_sessions.callee_id
  )
);

drop policy if exists chat_call_sessions_update_participants on public.chat_call_sessions;
create policy chat_call_sessions_update_participants
on public.chat_call_sessions
for update
using (caller_id = auth.uid() or callee_id = auth.uid())
with check (caller_id = auth.uid() or callee_id = auth.uid());

grant select, insert, update on public.chat_call_sessions to authenticated;

create table if not exists public.chat_call_ice_candidates (
  id bigserial primary key,
  call_id uuid not null references public.chat_call_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  candidate jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_call_ice_candidates_call_created_idx
on public.chat_call_ice_candidates (call_id, created_at);

alter table public.chat_call_ice_candidates enable row level security;

drop policy if exists chat_call_ice_candidates_select_participants on public.chat_call_ice_candidates;
create policy chat_call_ice_candidates_select_participants
on public.chat_call_ice_candidates
for select
using (
  exists (
    select 1
    from public.chat_call_sessions s
    where s.id = chat_call_ice_candidates.call_id
      and (s.caller_id = auth.uid() or s.callee_id = auth.uid())
  )
);

drop policy if exists chat_call_ice_candidates_insert_participants on public.chat_call_ice_candidates;
create policy chat_call_ice_candidates_insert_participants
on public.chat_call_ice_candidates
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.chat_call_sessions s
    where s.id = chat_call_ice_candidates.call_id
      and (s.caller_id = auth.uid() or s.callee_id = auth.uid())
  )
);

grant select, insert on public.chat_call_ice_candidates to authenticated;
grant usage, select on sequence public.chat_call_ice_candidates_id_seq to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_call_sessions'
    )
  then
    execute 'alter publication supabase_realtime add table public.chat_call_sessions';
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_call_ice_candidates'
    )
  then
    execute 'alter publication supabase_realtime add table public.chat_call_ice_candidates';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
