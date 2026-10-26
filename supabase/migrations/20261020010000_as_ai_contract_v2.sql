begin;

-- Keep the existing reserve/claim/complete flow, while aligning the database
-- guards with the current app contract: 5 photos + 1 video and schema v2.
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
     where conrelid = 'public.as_ai_media'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%sort_order%'
  loop
    execute format('alter table public.as_ai_media drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.as_ai_media
  add column if not exists duration_seconds double precision;

alter table public.as_ai_media
  add constraint as_ai_media_sort_order_check check (sort_order between 0 and 5);

alter table public.as_ai_media drop constraint if exists as_ai_media_duration_seconds_check;
alter table public.as_ai_media
  add constraint as_ai_media_duration_seconds_check
  check (duration_seconds is null or duration_seconds > 0 and duration_seconds <= 60);

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
     where conrelid = 'public.as_ai_analyses'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%schema_version%'
  loop
    execute format('alter table public.as_ai_analyses drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.as_ai_analyses
  add constraint as_ai_analyses_result_schema_check
  check (
    status <> 'completed'
    or (result is not null and coalesce(result->>'schema_version', '') in ('1', '2'))
  );

create or replace function public.reserve_as_ai_analysis(p_id uuid, p_user_id uuid, p_input jsonb, p_media jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.as_ai_analyses; item jsonb; idx integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('as-ai:' || p_user_id::text, 0));
  select * into existing from public.as_ai_analyses where id = p_id;
  if found then
    if existing.user_id <> p_user_id or existing.input_payload <> p_input then raise exception 'ANALYSIS_ID_CONFLICT'; end if;
    return to_jsonb(existing);
  end if;
  if (select count(*) from public.as_ai_analyses where user_id = p_user_id
    and status = 'completed' and completed_at > now() - interval '24 hours') >= 5 then
    raise exception 'ANALYSIS_DAILY_LIMIT';
  end if;
  if exists (select 1 from public.as_ai_analyses where user_id = p_user_id and status = 'processing'
    and processing_started_at > now() - interval '150 seconds') then
    raise exception 'ANALYSIS_BUSY';
  end if;
  if (select count(*) from public.as_ai_analyses where user_id = p_user_id
    and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'ANALYSIS_RATE_LIMIT';
  end if;
  if jsonb_typeof(p_media) is distinct from 'array' then raise exception 'INVALID_MEDIA'; end if;
  if jsonb_array_length(p_media) > 6 then raise exception 'INVALID_MEDIA'; end if;
  insert into public.as_ai_analyses(id, user_id, input_payload) values (p_id, p_user_id, p_input) returning * into existing;
  for item in select value from jsonb_array_elements(p_media) loop
    insert into public.as_ai_media(analysis_id, sort_order, path, mime_type, bytes, duration_seconds)
    values(p_id, idx, item->>'path', item->>'mime_type', (item->>'bytes')::bigint,
      case when item->>'duration_seconds' is null then null else (item->>'duration_seconds')::double precision end);
    idx := idx + 1;
  end loop;
  return to_jsonb(existing);
end;
$$;
revoke all on function public.reserve_as_ai_analysis(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_as_ai_analysis(uuid, uuid, jsonb, jsonb) to service_role;

create or replace function public.complete_as_ai_analysis(p_id uuid, p_user_id uuid, p_lease uuid, p_result jsonb, p_model text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.as_ai_analyses;
begin
  perform pg_advisory_xact_lock(hashtextextended('as-ai:' || p_user_id::text, 0));
  select * into a from public.as_ai_analyses where id = p_id and user_id = p_user_id for update;
  if not found then raise exception 'ANALYSIS_NOT_FOUND'; end if;
  if a.status = 'completed' then return to_jsonb(a); end if;
  if a.status <> 'processing' or a.lease_id is null or a.lease_id is distinct from p_lease
    or a.processing_started_at is null or a.processing_started_at <= now() - interval '150 seconds' then
    raise exception 'ANALYSIS_LEASE_EXPIRED';
  end if;
  if p_result is null or jsonb_typeof(p_result) is distinct from 'object'
    or coalesce(p_result->>'schema_version', '') not in ('1', '2') then raise exception 'INVALID_ANALYSIS_RESULT'; end if;
  if (select count(*) from public.as_ai_analyses where user_id = p_user_id
    and status = 'completed' and completed_at > now() - interval '24 hours') >= 5 then
    raise exception 'ANALYSIS_DAILY_LIMIT';
  end if;
  update public.as_ai_analyses set status = 'completed', result = p_result, model = p_model,
    completed_at = now(), error_message = null where id = p_id returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.complete_as_ai_analysis(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.complete_as_ai_analysis(uuid, uuid, uuid, jsonb, text) to service_role;

commit;
