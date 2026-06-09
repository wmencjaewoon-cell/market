-- Account settings: blocked users list/unblock and self account deletion.
-- Run this in the Supabase SQL Editor.

create table if not exists public.user_blocks (
  id bigserial primary key,
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id),
  constraint user_blocks_blocker_blocked_unique unique (blocker_id, blocked_id)
);

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own
on public.user_blocks
for select
using (blocker_id = auth.uid());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
on public.user_blocks
for insert
with check (blocker_id = auth.uid());

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own
on public.user_blocks
for delete
using (blocker_id = auth.uid());

grant select, insert, delete on public.user_blocks to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'user_blocks_id_seq'
  ) then
    grant usage, select on sequence public.user_blocks_id_seq to authenticated;
  end if;
end $$;

create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Login required';
  end if;

  delete from public.user_blocks
  where blocker_id = v_user_id
     or blocked_id = v_user_id;

  delete from auth.users
  where id = v_user_id;

  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

revoke all on function public.delete_current_user() from public;
grant execute on function public.delete_current_user() to authenticated;

select pg_notify('pgrst', 'reload schema');
