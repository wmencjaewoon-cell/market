-- Seller level system driven by score events.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists trust_points integer not null default 0,
  add column if not exists trust_level integer not null default 1,
  add column if not exists seller_level_style text not null default 'clean',
  add column if not exists show_level_on_profile boolean not null default true,
  add column if not exists show_level_on_posts boolean not null default true;

alter table public.reviews
  add column if not exists sentiment text not null default 'positive',
  add column if not exists feedback_tags text[] not null default '{}'::text[],
  add column if not exists comment text,
  add column if not exists level_points integer not null default 0;

alter table public.reviews
  alter column sentiment set default 'positive',
  alter column feedback_tags set default '{}'::text[],
  alter column level_points set default 0;

alter table public.reviews
  drop constraint if exists reviews_sentiment_check;

alter table public.reviews
  add constraint reviews_sentiment_check
  check (sentiment in ('positive', 'negative'));

create table if not exists public.seller_level_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  points integer not null,
  source_table text not null default 'manual',
  source_id text not null,
  unique_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists seller_level_events3_user_created_idx
on public.seller_level_events (user_id, created_at desc);

create index if not exists seller_level_events_type_idx
on public.seller_level_events (event_type);

alter table public.seller_level_events enable row level security;

drop policy if exists seller_level_events_select_own on public.seller_level_events;
create policy seller_level_events_select_own
on public.seller_level_events
for select
using (user_id = auth.uid());

grant select on public.seller_level_events to authenticated;

create or replace function public.calculate_seller_level(p_points integer)
returns integer
language sql
immutable
as $$
  select least(100, greatest(1, floor(greatest(coalesce(p_points, 0), 0)::numeric / 100)::integer + 1));
$$;

create or replace function public.refresh_seller_level(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points integer := 0;
  v_level integer := 1;
begin
  if p_user_id is null then
    return;
  end if;

  select greatest(coalesce(sum(coalesce(points, 0)), 0), 0)::integer
  into v_points
  from public.seller_level_events
  where user_id = p_user_id;

  v_level := public.calculate_seller_level(v_points);

  update public.profiles
  set
    trust_points = v_points,
    trust_level = v_level,
    seller_level_style = case
      when seller_level_style = 'legend' and v_level < 100 then 'clean'
      when seller_level_style = 'master' and v_level < 75 then 'clean'
      when seller_level_style = 'premium' and v_level < 50 then 'clean'
      when seller_level_style = 'gold' and v_level < 25 then 'clean'
      when seller_level_style = 'solid' and v_level < 10 then 'clean'
      when seller_level_style = 'fresh' and v_level < 5 then 'clean'
      else seller_level_style
    end,
    updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.refresh_seller_level_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_seller_level(new.user_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    perform public.refresh_seller_level(new.user_id);

    if old.user_id is distinct from new.user_id then
      perform public.refresh_seller_level(old.user_id);
    end if;

    return new;
  end if;

  perform public.refresh_seller_level(old.user_id);
  return old;
end;
$$;

drop trigger if exists seller_level_events_refresh_profile on public.seller_level_events;
create trigger seller_level_events_refresh_profile
after insert or update or delete on public.seller_level_events
for each row execute function public.refresh_seller_level_from_event();

create or replace function public.upsert_seller_level_event(
  p_user_id uuid,
  p_event_type text,
  p_points integer,
  p_source_table text,
  p_source_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_unique_key text;
begin
  if p_user_id is null then
    return null;
  end if;

  if nullif(trim(coalesce(p_event_type, '')), '') is null then
    raise exception 'event_type is required';
  end if;

  if nullif(trim(coalesce(p_source_table, '')), '') is null then
    raise exception 'source_table is required';
  end if;

  if nullif(trim(coalesce(p_source_id, '')), '') is null then
    raise exception 'source_id is required';
  end if;

  v_unique_key := concat_ws(
    ':',
    p_source_table,
    p_source_id,
    p_event_type,
    p_user_id::text
  );

  insert into public.seller_level_events (
    user_id,
    event_type,
    points,
    source_table,
    source_id,
    unique_key,
    metadata
  )
  values (
    p_user_id,
    p_event_type,
    p_points,
    p_source_table,
    p_source_id,
    v_unique_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (unique_key) do update
  set
    user_id = excluded.user_id,
    event_type = excluded.event_type,
    points = excluded.points,
    source_table = excluded.source_table,
    source_id = excluded.source_id,
    metadata = excluded.metadata
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.delete_seller_level_event(
  p_user_id uuid,
  p_event_type text,
  p_source_table text,
  p_source_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unique_key text;
begin
  if p_user_id is null
    or nullif(trim(coalesce(p_event_type, '')), '') is null
    or nullif(trim(coalesce(p_source_table, '')), '') is null
    or nullif(trim(coalesce(p_source_id, '')), '') is null then
    return;
  end if;

  v_unique_key := concat_ws(
    ':',
    p_source_table,
    p_source_id,
    p_event_type,
    p_user_id::text
  );

  delete from public.seller_level_events
  where unique_key = v_unique_key;
end;
$$;

create or replace function public.calculate_review_level_points(
  p_sentiment text,
  p_tags text[]
)
returns integer
language plpgsql
immutable
as $$
declare
  v_points integer := 0;
  v_sentiment text := coalesce(p_sentiment, 'positive');
  v_tags text[] := coalesce(p_tags, '{}'::text[]);
begin
  if v_sentiment = 'positive' then
    v_points := v_points + 15;

    if 'fast_response' = any(v_tags) then
      v_points := v_points + 5;
    end if;
  else
    if 'deal_canceled' = any(v_tags) then
      v_points := v_points - 5;
    end if;

    if 'item_mismatch' = any(v_tags) then
      v_points := v_points - 15;
    end if;
  end if;

  return v_points;
end;
$$;

create or replace function public.reviews_set_level_points()
returns trigger
language plpgsql
as $$
begin
  new.sentiment := coalesce(new.sentiment, 'positive');
  new.feedback_tags := coalesce(new.feedback_tags, '{}'::text[]);
  new.level_points := public.calculate_review_level_points(new.sentiment, new.feedback_tags);
  return new;
end;
$$;

drop trigger if exists reviews_set_level_points_before_save on public.reviews;
create trigger reviews_set_level_points_before_save
before insert or update on public.reviews
for each row execute function public.reviews_set_level_points();

create or replace function public.reviews_sync_seller_level_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id text;
  v_tags text[];
begin
  if tg_op = 'DELETE' then
    v_source_id := old.id::text;
  else
    v_source_id := new.id::text;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    perform public.delete_seller_level_event(old.target_user_id, 'positive_review', 'reviews', v_source_id);
    perform public.delete_seller_level_event(old.target_user_id, 'fast_response', 'reviews', v_source_id);
    perform public.delete_seller_level_event(old.target_user_id, 'repeated_cancellation', 'reviews', v_source_id);
    perform public.delete_seller_level_event(old.target_user_id, 'dispute', 'reviews', v_source_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.target_user_id is not null then
    v_tags := coalesce(new.feedback_tags, '{}'::text[]);

    if new.sentiment = 'positive' then
      perform public.upsert_seller_level_event(
        new.target_user_id,
        'positive_review',
        15,
        'reviews',
        v_source_id,
        jsonb_build_object('review_id', new.id, 'sentiment', new.sentiment)
      );

      if 'fast_response' = any(v_tags) then
        perform public.upsert_seller_level_event(
          new.target_user_id,
          'fast_response',
          5,
          'reviews',
          v_source_id,
          jsonb_build_object('review_id', new.id, 'tag', 'fast_response')
        );
      end if;
    else
      if 'deal_canceled' = any(v_tags) then
        perform public.upsert_seller_level_event(
          new.target_user_id,
          'repeated_cancellation',
          -5,
          'reviews',
          v_source_id,
          jsonb_build_object('review_id', new.id, 'tag', 'deal_canceled')
        );
      end if;

      if 'item_mismatch' = any(v_tags) then
        perform public.upsert_seller_level_event(
          new.target_user_id,
          'dispute',
          -15,
          'reviews',
          v_source_id,
          jsonb_build_object('review_id', new.id, 'tag', 'item_mismatch')
        );
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_refresh_seller_level on public.reviews;
drop trigger if exists reviews_sync_seller_level_events_after_save on public.reviews;
create trigger reviews_sync_seller_level_events_after_save
after insert or update or delete on public.reviews
for each row execute function public.reviews_sync_seller_level_events();

create or replace function public.listing_sales_sync_seller_level_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.delete_seller_level_event(old.seller_id, 'trade_completed', 'listing_sales', old.id::text);
    perform public.delete_seller_level_event(old.seller_id, 'no_cancellation', 'listing_sales', old.id::text);
    return old;
  end if;

  perform public.upsert_seller_level_event(
    new.seller_id,
    'trade_completed',
    10,
    'listing_sales',
    new.id::text,
    jsonb_build_object('listing_id', new.listing_id, 'buyer_id', new.buyer_id)
  );

  perform public.upsert_seller_level_event(
    new.seller_id,
    'no_cancellation',
    3,
    'listing_sales',
    new.id::text,
    jsonb_build_object('listing_id', new.listing_id, 'buyer_id', new.buyer_id)
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.listing_sales') is not null then
    execute 'drop trigger if exists listing_sales_sync_seller_level_events_after_save on public.listing_sales';
    execute 'create trigger listing_sales_sync_seller_level_events_after_save after insert or update or delete on public.listing_sales for each row execute function public.listing_sales_sync_seller_level_events()';
  end if;
end $$;

create or replace function public.reports_sync_seller_level_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.delete_seller_level_event(old.target_user_id, 'report_received', 'reports', old.id::text);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.target_user_id is distinct from new.target_user_id then
    perform public.delete_seller_level_event(old.target_user_id, 'report_received', 'reports', old.id::text);
  end if;

  perform public.upsert_seller_level_event(
    new.target_user_id,
    'report_received',
    -10,
    'reports',
    new.id::text,
    jsonb_build_object('report_id', new.id)
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.reports') is not null then
    execute 'drop trigger if exists reports_sync_seller_level_events_after_save on public.reports';
    execute 'create trigger reports_sync_seller_level_events_after_save after insert or update or delete on public.reports for each row execute function public.reports_sync_seller_level_events()';
  end if;
end $$;

create or replace function public.profile_has_level_completion(p_profile public.profiles)
returns boolean
language sql
stable
as $$
  select
    nullif(trim(coalesce(p_profile.display_name, '')), '') is not null
    and nullif(trim(coalesce(p_profile.phone, '')), '') is not null;
$$;

create or replace function public.profiles_sync_completion_level_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.display_name is not distinct from old.display_name
    and new.phone is not distinct from old.phone then
    return new;
  end if;

  if public.profile_has_level_completion(new) then
    perform public.upsert_seller_level_event(
      new.id,
      'profile_completed',
      5,
      'profiles',
      new.id::text,
      jsonb_build_object('display_name', new.display_name)
    );
  else
    perform public.delete_seller_level_event(
      new.id,
      'profile_completed',
      'profiles',
      new.id::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_completion_level_event_after_save on public.profiles;
create trigger profiles_sync_completion_level_event_after_save
after insert or update on public.profiles
for each row execute function public.profiles_sync_completion_level_event();

create or replace function public.record_seller_level_adjustment(
  p_user_id uuid,
  p_event_type text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
  v_points integer;
begin
  if to_regprocedure('public.is_admin()') is not null then
    execute 'select public.is_admin()' into v_is_admin;
  end if;

  if not coalesce(v_is_admin, false) then
    raise exception 'Only admins can adjust seller level';
  end if;

  v_points := case p_event_type
    when 'repeated_cancellation' then -5
    when 'report_received' then -10
    when 'dispute' then -15
    when 'false_listing_confirmed' then -30
    when 'admin_warning' then -20
    else null
  end;

  if v_points is null then
    raise exception 'Invalid seller level adjustment type';
  end if;

  return public.upsert_seller_level_event(
    p_user_id,
    p_event_type,
    v_points,
    'manual_adjustments',
    gen_random_uuid()::text,
    jsonb_build_object('note', p_note, 'admin_id', auth.uid())
  );
end;
$$;

update public.reviews
set
  sentiment = coalesce(sentiment, 'positive'),
  feedback_tags = coalesce(feedback_tags, '{}'::text[]),
  level_points = public.calculate_review_level_points(
    coalesce(sentiment, 'positive'),
    coalesce(feedback_tags, '{}'::text[])
  );

insert into public.seller_level_events (
  user_id,
  event_type,
  points,
  source_table,
  source_id,
  unique_key,
  metadata
)
select
  target_user_id,
  'positive_review',
  15,
  'reviews',
  id::text,
  concat_ws(':', 'reviews', id::text, 'positive_review', target_user_id::text),
  jsonb_build_object('review_id', id, 'sentiment', sentiment)
from public.reviews
where target_user_id is not null
  and sentiment = 'positive'
on conflict (unique_key) do update
set points = excluded.points,
    metadata = excluded.metadata;

insert into public.seller_level_events (
  user_id,
  event_type,
  points,
  source_table,
  source_id,
  unique_key,
  metadata
)
select
  target_user_id,
  'fast_response',
  5,
  'reviews',
  id::text,
  concat_ws(':', 'reviews', id::text, 'fast_response', target_user_id::text),
  jsonb_build_object('review_id', id, 'tag', 'fast_response')
from public.reviews
where target_user_id is not null
  and sentiment = 'positive'
  and 'fast_response' = any(coalesce(feedback_tags, '{}'::text[]))
on conflict (unique_key) do update
set points = excluded.points,
    metadata = excluded.metadata;

insert into public.seller_level_events (
  user_id,
  event_type,
  points,
  source_table,
  source_id,
  unique_key,
  metadata
)
select
  target_user_id,
  'repeated_cancellation',
  -5,
  'reviews',
  id::text,
  concat_ws(':', 'reviews', id::text, 'repeated_cancellation', target_user_id::text),
  jsonb_build_object('review_id', id, 'tag', 'deal_canceled')
from public.reviews
where target_user_id is not null
  and sentiment = 'negative'
  and 'deal_canceled' = any(coalesce(feedback_tags, '{}'::text[]))
on conflict (unique_key) do update
set points = excluded.points,
    metadata = excluded.metadata;

insert into public.seller_level_events (
  user_id,
  event_type,
  points,
  source_table,
  source_id,
  unique_key,
  metadata
)
select
  target_user_id,
  'dispute',
  -15,
  'reviews',
  id::text,
  concat_ws(':', 'reviews', id::text, 'dispute', target_user_id::text),
  jsonb_build_object('review_id', id, 'tag', 'item_mismatch')
from public.reviews
where target_user_id is not null
  and sentiment = 'negative'
  and 'item_mismatch' = any(coalesce(feedback_tags, '{}'::text[]))
on conflict (unique_key) do update
set points = excluded.points,
    metadata = excluded.metadata;

insert into public.seller_level_events (
  user_id,
  event_type,
  points,
  source_table,
  source_id,
  unique_key,
  metadata
)
select
  p.id,
  'profile_completed',
  5,
  'profiles',
  p.id::text,
  concat_ws(':', 'profiles', p.id::text, 'profile_completed', p.id::text),
  jsonb_build_object('display_name', p.display_name)
from public.profiles p
where public.profile_has_level_completion(p)
on conflict (unique_key) do update
set points = excluded.points,
    metadata = excluded.metadata;

do $$
begin
  if to_regclass('public.listing_sales') is not null then
    execute $backfill$
      insert into public.seller_level_events (
        user_id,
        event_type,
        points,
        source_table,
        source_id,
        unique_key,
        metadata
      )
      select
        seller_id,
        'trade_completed',
        10,
        'listing_sales',
        id::text,
        concat_ws(':', 'listing_sales', id::text, 'trade_completed', seller_id::text),
        jsonb_build_object('listing_id', listing_id, 'buyer_id', buyer_id)
      from public.listing_sales
      where seller_id is not null
      on conflict (unique_key) do update
      set points = excluded.points,
          metadata = excluded.metadata
    $backfill$;

    execute $backfill$
      insert into public.seller_level_events (
        user_id,
        event_type,
        points,
        source_table,
        source_id,
        unique_key,
        metadata
      )
      select
        seller_id,
        'no_cancellation',
        3,
        'listing_sales',
        id::text,
        concat_ws(':', 'listing_sales', id::text, 'no_cancellation', seller_id::text),
        jsonb_build_object('listing_id', listing_id, 'buyer_id', buyer_id)
      from public.listing_sales
      where seller_id is not null
      on conflict (unique_key) do update
      set points = excluded.points,
          metadata = excluded.metadata
    $backfill$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.reports') is not null then
    execute $backfill$
      insert into public.seller_level_events (
        user_id,
        event_type,
        points,
        source_table,
        source_id,
        unique_key,
        metadata
      )
      select
        target_user_id,
        'report_received',
        -10,
        'reports',
        id::text,
        concat_ws(':', 'reports', id::text, 'report_received', target_user_id::text),
        jsonb_build_object('report_id', id)
      from public.reports
      where target_user_id is not null
      on conflict (unique_key) do update
      set points = excluded.points,
          metadata = excluded.metadata
    $backfill$;
  end if;
end $$;

do $$
declare
  profile_row record;
begin
  for profile_row in
    select id
    from public.profiles
  loop
    perform public.refresh_seller_level(profile_row.id);
  end loop;
end $$;

revoke all on function public.refresh_seller_level(uuid) from public;
revoke all on function public.upsert_seller_level_event(uuid, text, integer, text, text, jsonb) from public;
revoke all on function public.delete_seller_level_event(uuid, text, text, text) from public;

grant execute on function public.calculate_seller_level(integer) to authenticated;
grant execute on function public.calculate_review_level_points(text, text[]) to authenticated;
grant execute on function public.record_seller_level_adjustment(uuid, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
