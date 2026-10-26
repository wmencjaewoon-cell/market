begin;

-- Analysis is not an inquiry: creating a draft must not notify stores/admins.
create table if not exists public.as_ai_analyses (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_payload jsonb not null,
  status text not null default 'uploading' check (status in ('uploading', 'processing', 'completed', 'failed')),
  result jsonb,
  model text,
  attempts integer not null default 0,
  lease_id uuid,
  processing_started_at timestamptz,
  error_message text,
  linked_request_id bigint unique references public.estimate_requests(id) on delete set null,
  provider_file_names text[] not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (status <> 'completed' or (result is not null and result->>'schema_version' = '1'))
);
create index if not exists as_ai_analyses_user_created on public.as_ai_analyses(user_id, created_at desc);
create index if not exists as_ai_analyses_retention on public.as_ai_analyses(created_at) where linked_request_id is null;

create table if not exists public.as_ai_media (
  analysis_id uuid not null references public.as_ai_analyses(id) on delete cascade,
  sort_order integer not null check (sort_order between 0 and 4),
  path text not null unique,
  mime_type text not null,
  bytes bigint not null check (bytes > 0 and bytes <= 31457280),
  primary key (analysis_id, sort_order)
);

create table if not exists public.as_repair_guides (
  key text primary key check (key in ('furniture_felt_pad', 'cabinet_knob')),
  title text not null,
  applicability text not null,
  tools text[] not null default '{}',
  steps text[] not null default '{}',
  warnings text[] not null default '{}',
  stop_conditions text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.estimate_requests add column if not exists ai_analysis_id uuid
  references public.as_ai_analyses(id) on delete set null;
create unique index if not exists estimate_requests_ai_analysis_unique
  on public.estimate_requests(ai_analysis_id) where ai_analysis_id is not null;

alter table public.as_ai_analyses enable row level security;
alter table public.as_ai_media enable row level security;
alter table public.as_repair_guides enable row level security;
revoke all on public.as_ai_analyses, public.as_ai_media, public.as_repair_guides from anon, authenticated;
grant select on public.as_ai_analyses, public.as_ai_media, public.as_repair_guides to authenticated;
grant all on public.as_ai_analyses, public.as_ai_media, public.as_repair_guides to service_role;

drop policy if exists as_ai_read on public.as_ai_analyses;
create policy as_ai_read on public.as_ai_analyses for select to authenticated using (
  user_id = auth.uid() or exists (
    -- Existing inquiry RLS still decides which admin/store/staff can read a submitted result.
    select 1 from public.estimate_requests r where r.id = linked_request_id
  )
);
drop policy if exists as_ai_media_read on public.as_ai_media;
create policy as_ai_media_read on public.as_ai_media for select to authenticated using (
  exists (select 1 from public.as_ai_analyses a where a.id = analysis_id and a.user_id = auth.uid())
);
drop policy if exists as_guide_read on public.as_repair_guides;
create policy as_guide_read on public.as_repair_guides for select to authenticated using (
  (status = 'published' and reviewed_at is not null and reviewed_by is not null)
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.status, '') <> 'blocked')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('as-analysis-media', 'as-analysis-media', false, 31457280,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm','video/x-m4v'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Frozen manifest paths, no upsert: users cannot replace media after analysis starts.
drop policy if exists as_ai_media_upload on storage.objects;
create policy as_ai_media_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'as-analysis-media' and exists (
    select 1 from public.as_ai_media m join public.as_ai_analyses a on a.id = m.analysis_id
    where m.path = name and a.user_id = auth.uid()
      and a.status in ('uploading', 'failed') and a.attempts < 2 and a.created_at > now() - interval '1 day'
  )
);
drop policy if exists as_ai_media_download on storage.objects;
create policy as_ai_media_download on storage.objects for select to authenticated using (
  bucket_id = 'as-analysis-media' and exists (
    select 1 from public.as_ai_media m join public.as_ai_analyses a on a.id = m.analysis_id
    where m.path = name and a.user_id = auth.uid()
  )
);

-- Restrictive guards also protect this new bucket if a legacy policy permits all buckets.
drop policy if exists as_ai_storage_read_guard on storage.objects;
create policy as_ai_storage_read_guard on storage.objects as restrictive for select to authenticated using (
  bucket_id <> 'as-analysis-media' or exists (
    select 1 from public.as_ai_media m join public.as_ai_analyses a on a.id = m.analysis_id
    where m.path = name and a.user_id = auth.uid()
  )
);
drop policy if exists as_ai_storage_insert_guard on storage.objects;
create policy as_ai_storage_insert_guard on storage.objects as restrictive for insert to authenticated with check (
  bucket_id <> 'as-analysis-media' or exists (
    select 1 from public.as_ai_media m join public.as_ai_analyses a on a.id = m.analysis_id
    where m.path = name and a.user_id = auth.uid() and a.status in ('uploading', 'failed')
      and a.attempts < 2 and a.created_at > now() - interval '1 day'
  )
);
drop policy if exists as_ai_storage_update_guard on storage.objects;
create policy as_ai_storage_update_guard on storage.objects as restrictive for update to public
  using (bucket_id <> 'as-analysis-media') with check (bucket_id <> 'as-analysis-media');
drop policy if exists as_ai_storage_delete_guard on storage.objects;
create policy as_ai_storage_delete_guard on storage.objects as restrictive for delete to public using (bucket_id <> 'as-analysis-media');
drop policy if exists as_ai_storage_anon_guard on storage.objects;
create policy as_ai_storage_anon_guard on storage.objects as restrictive for all to anon
  using (bucket_id <> 'as-analysis-media') with check (bucket_id <> 'as-analysis-media');

-- Only Edge Functions can reserve quota or mutate a result. Atomic user locks prevent parallel quota bypass.
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
  if jsonb_typeof(p_media) <> 'array' or jsonb_array_length(p_media) not between 1 and 5 then raise exception 'INVALID_MEDIA'; end if;
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
  if a.status = 'completed' then return to_jsonb(a); end if;
  if exists (select 1 from public.as_ai_analyses where user_id = p_user_id and status = 'processing' and processing_started_at > now() - interval '150 seconds') then
    raise exception 'ANALYSIS_BUSY';
  end if;
  if a.attempts >= 2 then raise exception 'ANALYSIS_RETRY_LIMIT'; end if;
  if a.created_at < now() - interval '1 day' then raise exception 'ANALYSIS_EXPIRED'; end if;
  update public.as_ai_analyses set status = 'processing', attempts = attempts + 1, lease_id = p_lease,
    processing_started_at = now(), error_message = null where id = p_id returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.claim_as_ai_analysis(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_as_ai_analysis(uuid, uuid, uuid) to service_role;

-- Link only the applicant's completed result. Clients cannot attach someone else's result or overwrite history.
create or replace function public.enforce_inquiry_as_analysis()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.ai_analysis_id is distinct from old.ai_analysis_id then
      -- Account deletion/retention may remove the referenced row; permit FK SET NULL,
      -- but do not let clients detach an existing analysis from submitted history.
      if new.ai_analysis_id is null and old.ai_analysis_id is not null
        and not exists (select 1 from public.as_ai_analyses where id = old.ai_analysis_id) then
        return new;
      end if;
      raise exception '접수한 문의의 AI 분석 연결은 변경할 수 없습니다.';
    end if;
    return new;
  end if;
  if new.ai_analysis_id is not null then
    if not exists (select 1 from public.as_ai_analyses a where a.id = new.ai_analysis_id
      and a.user_id = new.user_id and a.status = 'completed' and a.linked_request_id is null) then
      raise exception '본인의 완료된 AI 분석만 문의에 연결할 수 있습니다.';
    end if;
    if auth.uid() is distinct from new.user_id and coalesce(auth.role(), '') <> 'service_role' then
      raise exception '본인의 AI 분석만 문의에 연결할 수 있습니다.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_inquiry_as_analysis on public.estimate_requests;
create trigger enforce_inquiry_as_analysis before insert or update of ai_analysis_id on public.estimate_requests
for each row execute function public.enforce_inquiry_as_analysis();

create or replace function public.link_inquiry_as_analysis()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.ai_analysis_id is not null then
    update public.as_ai_analyses set linked_request_id = new.id where id = new.ai_analysis_id;
  end if;
  return new;
end;
$$;
drop trigger if exists link_inquiry_as_analysis on public.estimate_requests;
create trigger link_inquiry_as_analysis after insert on public.estimate_requests
for each row execute function public.link_inquiry_as_analysis();

create or replace function public.save_as_repair_guide(p_key text, p_content jsonb, p_publish boolean, p_review_confirmed boolean)
returns public.as_repair_guides language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.as_repair_guides; field text;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and coalesce(status, '') <> 'blocked') then
    raise exception '관리자만 셀프 가이드를 검수할 수 있습니다.';
  end if;
  if p_key not in ('furniture_felt_pad', 'cabinet_knob') then raise exception '지원하지 않는 작업입니다.'; end if;
  if p_publish and not coalesce(p_review_confirmed, false) then raise exception '적용 범위와 안전 내용을 검수해 주세요.'; end if;
  if length(trim(coalesce(p_content->>'title', ''))) not between 1 and 100
    or length(trim(coalesce(p_content->>'applicability', ''))) not between 1 and 1500 then raise exception '제목과 적용 범위를 입력해 주세요.'; end if;
  foreach field in array array['tools', 'steps', 'warnings', 'stop_conditions'] loop
    if jsonb_typeof(p_content->field) is distinct from 'array' then raise exception '가이드 목록 형식이 올바르지 않습니다.'; end if;
    if jsonb_array_length(p_content->field) > 15 or (p_publish and jsonb_array_length(p_content->field) = 0) then
      raise exception '게시할 가이드의 준비물, 절차, 주의사항, 중단 조건을 입력해 주세요.';
    end if;
    if exists(select 1 from jsonb_array_elements(p_content->field) v where jsonb_typeof(v) <> 'string' or length(trim(v #>> '{}')) not between 1 and 1500) then
      raise exception '가이드 항목의 내용이나 길이를 확인해 주세요.';
    end if;
  end loop;
  update public.as_repair_guides set title = trim(p_content->>'title'), applicability = trim(p_content->>'applicability'),
    tools = array(select jsonb_array_elements_text(p_content->'tools')),
    steps = array(select jsonb_array_elements_text(p_content->'steps')),
    warnings = array(select jsonb_array_elements_text(p_content->'warnings')),
    stop_conditions = array(select jsonb_array_elements_text(p_content->'stop_conditions')),
    status = case when p_publish then 'published' else 'draft' end,
    reviewed_by = case when p_publish then auth.uid() else null end,
    reviewed_at = case when p_publish then now() else null end, updated_at = now()
    where key = p_key returning * into result;
  if not found then raise exception '가이드를 찾을 수 없습니다.'; end if;
  return result;
end;
$$;
revoke all on function public.save_as_repair_guide(text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.save_as_repair_guide(text, jsonb, boolean, boolean) to authenticated;

-- Intentionally unpublished. A domain reviewer must write/approve the actual procedures before release.
insert into public.as_repair_guides(key, title, applicability) values
  ('furniture_felt_pad', '가벼운 가구의 바닥 보호 패드 교체', '혼자 안전하게 다룰 수 있는 가벼운 가구의 접착식 보호 패드에 한합니다. 무거운 가구, 파손된 다리, 전도 위험이 있으면 제외합니다.'),
  ('cabinet_knob', '일반 수납장 손잡이 교체', '작고 가벼운 일반 수납장의 외부 손잡이만 대상으로 합니다. 유리문, 파손된 고정부, 무거운 문, 잠금장치, 매립 작업은 제외합니다.')
on conflict (key) do nothing;

create or replace function public.as_ai_expired_media()
returns table(path text) language sql security definer set search_path = public, storage, pg_temp as $$
  select o.name from storage.objects o
  left join public.as_ai_media m on m.path = o.name
  left join public.as_ai_analyses a on a.id = m.analysis_id
  where o.bucket_id = 'as-analysis-media'
    and ((a.id is null and o.created_at < now() - interval '1 day') or a.created_at < now() - interval '30 days')
  order by o.created_at limit 250;
$$;
revoke all on function public.as_ai_expired_media() from public, anon, authenticated;
grant execute on function public.as_ai_expired_media() to service_role;

create or replace function public.purge_expired_as_ai_analyses()
returns bigint language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare removed bigint;
begin
  -- Storage API removes physical objects first; never delete storage.objects directly.
  delete from public.as_ai_analyses a where a.linked_request_id is null
    and a.created_at < now() - interval '30 days' and cardinality(a.provider_file_names) = 0
    and not exists (select 1 from storage.objects o where o.bucket_id = 'as-analysis-media'
      and o.name like a.user_id::text || '/' || a.id::text || '/%');
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.purge_expired_as_ai_analyses() from public, anon, authenticated;
grant execute on function public.purge_expired_as_ai_analyses() to service_role;

commit;
