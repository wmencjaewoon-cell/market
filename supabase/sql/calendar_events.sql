-- Private calendar events for app users.
-- Project schedules, estimate dates, and daily reports are read from their own tables.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(status, 'active') = 'active'
  );
$$;

grant execute on function public.is_admin() to authenticated;

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  store_user_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.store_projects(id) on delete cascade,
  estimate_request_id bigint references public.estimate_requests(id) on delete cascade,
  event_type text not null default 'personal',
  visibility text not null default 'private',
  title text not null,
  memo text,
  start_date date not null,
  end_date date,
  start_time time,
  end_time time,
  status text not null default 'scheduled',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_event_type_check check (event_type in ('personal')),
  constraint calendar_events_visibility_check check (visibility in ('private')),
  constraint calendar_events_status_check check (status in ('scheduled', 'in_progress', 'done', 'canceled')),
  constraint calendar_events_date_order_check check (end_date is null or end_date >= start_date)
);

create index if not exists calendar_events_owner_date_idx
on public.calendar_events (owner_user_id, start_date, end_date);

create index if not exists calendar_events_store_date_idx
on public.calendar_events (store_user_id, start_date)
where store_user_id is not null;

alter table public.calendar_events enable row level security;

drop policy if exists calendar_events_select_own_or_admin
on public.calendar_events;

create policy calendar_events_select_own_or_admin
on public.calendar_events
for select
using (owner_user_id = auth.uid() or public.is_admin());

drop policy if exists calendar_events_insert_own
on public.calendar_events;

create policy calendar_events_insert_own
on public.calendar_events
for insert
with check (
  owner_user_id = auth.uid()
  and created_by = auth.uid()
  and event_type = 'personal'
  and visibility = 'private'
);

drop policy if exists calendar_events_update_own
on public.calendar_events;

create policy calendar_events_update_own
on public.calendar_events
for update
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and created_by = auth.uid()
  and event_type = 'personal'
  and visibility = 'private'
);

drop policy if exists calendar_events_delete_own
on public.calendar_events;

create policy calendar_events_delete_own
on public.calendar_events
for delete
using (owner_user_id = auth.uid() or public.is_admin());

create or replace function public.touch_calendar_events_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_calendar_events_updated_at
on public.calendar_events;

create trigger touch_calendar_events_updated_at
before update on public.calendar_events
for each row
execute function public.touch_calendar_events_updated_at();

revoke all on function public.touch_calendar_events_updated_at() from public;

grant select, insert, update, delete on public.calendar_events to authenticated;

select pg_notify('pgrst', 'reload schema');
