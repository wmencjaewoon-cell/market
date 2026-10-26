-- Apply after 20260928000000_as_ai_analysis.sql. Text-only questions use the same
-- owner, quota and retry rules, but have no storage objects to reserve or upload.
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
  if (select count(*) from public.as_ai_analyses where user_id = p_user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'ANALYSIS_DAILY_LIMIT';
  end if;
  if exists (select 1 from public.as_ai_analyses where user_id = p_user_id and status = 'processing' and processing_started_at > now() - interval '150 seconds') then
    raise exception 'ANALYSIS_BUSY';
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
