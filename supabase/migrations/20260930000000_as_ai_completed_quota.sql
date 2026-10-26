begin;

-- The allowance is consumed by saved answers, not drafts, uploads or failures.
-- Preserve older successful records that predate a populated completion timestamp.
update public.as_ai_analyses set completed_at = created_at
where status = 'completed' and completed_at is null;
create index if not exists as_ai_analyses_user_completed
  on public.as_ai_analyses(user_id, completed_at desc) where status = 'completed';

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
  -- A separate short-window guard bounds abandoned uploads without spending an answer.
  if (select count(*) from public.as_ai_analyses where user_id = p_user_id
    and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'ANALYSIS_RATE_LIMIT';
  end if;
  if jsonb_typeof(p_media) is distinct from 'array' then raise exception 'INVALID_MEDIA'; end if;
  if jsonb_array_length(p_media) > 5 then raise exception 'INVALID_MEDIA'; end if;
  insert into public.as_ai_analyses(id, user_id, input_payload) values (p_id, p_user_id, p_input) returning * into existing;
  for item in select value from jsonb_array_elements(p_media) loop
    insert into public.as_ai_media(analysis_id, sort_order, path, mime_type, bytes)
    values(p_id, idx, item->>'path', item->>'mime_type', (item->>'bytes')::bigint);
    idx := idx + 1;
  end loop;
  return to_jsonb(existing);
end;
$$;
revoke all on function public.reserve_as_ai_analysis(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_as_ai_analysis(uuid, uuid, jsonb, jsonb) to service_role;

create or replace function public.claim_as_ai_analysis(p_id uuid, p_user_id uuid, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.as_ai_analyses;
begin
  perform pg_advisory_xact_lock(hashtextextended('as-ai:' || p_user_id::text, 0));
  select * into a from public.as_ai_analyses where id = p_id and user_id = p_user_id for update;
  if not found then raise exception 'ANALYSIS_NOT_FOUND'; end if;
  -- Re-reading a saved answer never consumes another allowance or provider call.
  if a.status = 'completed' then return to_jsonb(a); end if;
  if exists (select 1 from public.as_ai_analyses where user_id = p_user_id and status = 'processing'
    and processing_started_at > now() - interval '150 seconds') then
    raise exception 'ANALYSIS_BUSY';
  end if;
  if a.attempts >= 2 then raise exception 'ANALYSIS_RETRY_LIMIT'; end if;
  if a.created_at < now() - interval '1 day' then raise exception 'ANALYSIS_EXPIRED'; end if;
  -- Previously reserved IDs must not bypass the success limit at execution time.
  if (select count(*) from public.as_ai_analyses where user_id = p_user_id
    and status = 'completed' and completed_at > now() - interval '24 hours') >= 5 then
    raise exception 'ANALYSIS_DAILY_LIMIT';
  end if;
  if exists (select 1 from public.as_ai_analyses where user_id = p_user_id
    and processing_started_at > now() - interval '15 seconds') then
    raise exception 'ANALYSIS_RATE_LIMIT';
  end if;
  -- Revoke stale workers before issuing another lease, including a different draft.
  update public.as_ai_analyses set status = 'failed', lease_id = null,
    error_message = '분석 시간이 초과되었습니다. 다시 시도하거나 상담을 요청해 주세요.'
    where user_id = p_user_id and status = 'processing';
  update public.as_ai_analyses set status = 'processing', attempts = attempts + 1, lease_id = p_lease,
    processing_started_at = now(), error_message = null where id = p_id returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.claim_as_ai_analysis(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_as_ai_analysis(uuid, uuid, uuid) to service_role;

-- Completion uses the same user lock as claims. Late/duplicate workers cannot
-- overwrite an answer or race another completion past the daily allowance.
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
    or p_result->>'schema_version' is distinct from '1' then raise exception 'INVALID_ANALYSIS_RESULT'; end if;
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
