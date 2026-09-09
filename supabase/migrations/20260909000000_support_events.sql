-- 고객지원 이벤트: 공개 이벤트 목록/상세와 관리자 이벤트 관리를 위한 테이블.
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

grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.support_events (
  id bigserial primary key,
  title text not null,
  summary text,
  content text not null,
  image_url text,
  is_published boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_events
  add column if not exists summary text,
  add column if not exists image_url text,
  add column if not exists is_published boolean not null default true,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists sort_order integer not null default 0,
  add column if not exists author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists support_events_public_idx
on public.support_events (is_published, ends_at, sort_order desc, created_at desc);

create or replace function public.set_support_events_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists support_events_set_updated_at on public.support_events;
create trigger support_events_set_updated_at
before update on public.support_events
for each row
execute function public.set_support_events_updated_at();

alter table public.support_events enable row level security;

drop policy if exists support_events_select_public_or_admin on public.support_events;
create policy support_events_select_public_or_admin
on public.support_events
for select
using (
  public.is_admin()
  or (
    is_published = true
    and (ends_at is null or ends_at >= now())
  )
);

drop policy if exists support_events_admin_insert on public.support_events;
create policy support_events_admin_insert
on public.support_events
for insert
with check (public.is_admin());

drop policy if exists support_events_admin_update on public.support_events;
create policy support_events_admin_update
on public.support_events
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists support_events_admin_delete on public.support_events;
create policy support_events_admin_delete
on public.support_events
for delete
using (public.is_admin());

grant select on public.support_events to anon;
grant select, insert, update, delete on public.support_events to authenticated;
grant usage, select on sequence public.support_events_id_seq to authenticated;
