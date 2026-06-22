-- Store verification approval flow.
-- Run after the base profiles table exists. This script is safe to re-run.

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists status text not null default 'active',
  add column if not exists user_type text not null default 'personal',
  add column if not exists phone text,
  add column if not exists is_phone_public boolean not null default false,
  add column if not exists business_number text,
  add column if not exists business_verified boolean not null default false,
  add column if not exists business_verified_at timestamptz,
  add column if not exists store_verification_status text not null default 'none',
  add column if not exists store_address text,
  add column if not exists store_latitude double precision,
  add column if not exists store_longitude double precision;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_store_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_store_verification_status_check
      check (
        store_verification_status in (
          'none',
          'pending',
          'approved',
          'rejected',
          'needs_more_info',
          'canceled'
        )
      );
  end if;
end $$;

select set_config('app.store_verification_internal', 'true', false);

update public.profiles
set store_verification_status = 'approved'
where user_type = 'store'
  and coalesce(business_verified, false)
  and coalesce(store_verification_status, 'none') = 'none';

update public.profiles
set
  user_type = 'personal',
  is_phone_public = false,
  store_verification_status = 'none'
where user_type = 'store'
  and not coalesce(business_verified, false);

select set_config('app.store_verification_internal', 'false', false);

create index if not exists profiles_verified_business_number_lookup_idx
on public.profiles (business_number)
where business_verified = true
  and business_number is not null;

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

create table if not exists public.admin_logs (
  id bigserial primary key,
  admin_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action text not null,
  target_table text,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_logs enable row level security;

drop policy if exists admin_logs_admin_select on public.admin_logs;
create policy admin_logs_admin_select
on public.admin_logs
for select
using (public.is_admin());

drop policy if exists admin_logs_admin_insert on public.admin_logs;
create policy admin_logs_admin_insert
on public.admin_logs
for insert
with check (public.is_admin());

create table if not exists public.store_verification_requests (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_number text not null,
  store_name text not null,
  representative_name text,
  phone text not null,
  store_address text,
  store_latitude double precision,
  store_longitude double precision,
  document_path text not null,
  document_mime_type text,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'needs_more_info', 'canceled')
  ),
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_verification_requests
  add column if not exists document_mime_type text;

create index if not exists store_verification_requests_user_idx
on public.store_verification_requests (user_id, created_at desc);

create index if not exists store_verification_requests_status_idx
on public.store_verification_requests (status, created_at desc);

create unique index if not exists store_verification_requests_active_business_number_idx
on public.store_verification_requests (business_number)
where status in ('pending', 'approved');

create unique index if not exists store_verification_requests_user_pending_idx
on public.store_verification_requests (user_id)
where status = 'pending';

alter table public.store_verification_requests enable row level security;

drop policy if exists store_verification_requests_select_own_or_admin
on public.store_verification_requests;
create policy store_verification_requests_select_own_or_admin
on public.store_verification_requests
for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists store_verification_requests_insert_own
on public.store_verification_requests;
create policy store_verification_requests_insert_own
on public.store_verification_requests
for insert
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists store_verification_requests_admin_update
on public.store_verification_requests;
create policy store_verification_requests_admin_update
on public.store_verification_requests
for update
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'store-verification-docs',
  'store-verification-docs',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Store verification docs are readable by owner or admin"
on storage.objects;
drop policy if exists "Users can upload own store verification docs"
on storage.objects;

create policy "Store verification docs are readable by owner or admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'store-verification-docs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

create policy "Users can upload own store verification docs"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-verification-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.protect_store_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_internal boolean :=
    coalesce(current_setting('app.store_verification_internal', true), '') = 'true';
begin
  if v_internal or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.business_verified := false;
    new.business_verified_at := null;
    new.store_verification_status := coalesce(new.store_verification_status, 'none');

    if coalesce(new.user_type, 'personal') = 'store' then
      new.user_type := 'personal';
      new.is_phone_public := false;
      new.business_number := null;
      new.store_address := null;
      new.store_latitude := null;
      new.store_longitude := null;
    end if;

    return new;
  end if;

  if coalesce(old.user_type, 'personal') = 'store'
     and coalesce(old.business_verified, false)
     and coalesce(new.user_type, 'store') = 'personal' then
    new.business_number := null;
    new.business_verified := false;
    new.business_verified_at := null;
    new.store_verification_status := 'none';
    new.store_address := null;
    new.store_latitude := null;
    new.store_longitude := null;
    new.is_phone_public := false;
    return new;
  end if;

  new.business_verified := old.business_verified;
  new.business_verified_at := old.business_verified_at;
  new.store_verification_status := old.store_verification_status;

  if coalesce(new.user_type, 'personal') = 'store'
     and not coalesce(old.business_verified, false) then
    new.user_type := old.user_type;
  end if;

  if coalesce(old.business_verified, false) then
    new.business_number := old.business_number;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_store_verification_fields
on public.profiles;
create trigger profiles_protect_store_verification_fields
before insert or update on public.profiles
for each row
execute function public.protect_store_verification_fields();

create or replace function public.enforce_unique_verified_business_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_number text;
begin
  if not coalesce(new.business_verified, false) then
    return new;
  end if;

  v_business_number := regexp_replace(coalesce(new.business_number, ''), '[^0-9]', '', 'g');

  if v_business_number = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles
    where id <> new.id
      and coalesce(business_verified, false)
      and business_number = v_business_number
  ) then
    raise exception '이미 다른 계정에서 승인된 사업자등록번호입니다.';
  end if;

  new.business_number := v_business_number;
  return new;
end;
$$;

drop trigger if exists profiles_unique_verified_business_number
on public.profiles;
create trigger profiles_unique_verified_business_number
before insert or update on public.profiles
for each row
execute function public.enforce_unique_verified_business_number();

drop function if exists public.submit_store_verification_request(
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text
);

create or replace function public.submit_store_verification_request(
  p_business_number text,
  p_store_name text,
  p_representative_name text default null,
  p_phone text default null,
  p_store_address text default null,
  p_store_latitude double precision default null,
  p_store_longitude double precision default null,
  p_document_path text default null,
  p_document_mime_type text default null
)
returns public.store_verification_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_number text;
  v_request public.store_verification_requests%rowtype;
  v_existing_id bigint;
  v_user_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select *
  into v_user_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception '회원 정보를 찾을 수 없습니다.';
  end if;

  if coalesce(v_user_profile.business_verified, false) then
    raise exception '이미 승인된 가게입니다. 사업자 정보 변경은 관리자에게 문의해 주세요.';
  end if;

  v_business_number := regexp_replace(coalesce(p_business_number, ''), '[^0-9]', '', 'g');

  if length(v_business_number) <> 10 then
    raise exception '사업자등록번호는 10자리여야 합니다.';
  end if;

  if length(trim(coalesce(p_store_name, ''))) < 2 then
    raise exception '상호명을 입력해 주세요.';
  end if;

  if length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) < 8 then
    raise exception '대표 전화번호를 입력해 주세요.';
  end if;

  if trim(coalesce(p_document_path, '')) = '' then
    raise exception '사업자등록증 파일을 업로드해 주세요.';
  end if;

  if split_part(p_document_path, '/', 1) <> auth.uid()::text then
    raise exception '본인 계정의 사업자등록증 파일만 제출할 수 있습니다.';
  end if;

  if coalesce(p_document_mime_type, '') not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ) then
    raise exception '사업자등록증은 PDF, JPG, PNG, WEBP 파일만 업로드할 수 있습니다.';
  end if;

  select id
  into v_existing_id
  from public.profiles
  where business_number = v_business_number
    and coalesce(business_verified, false)
    and id <> auth.uid()
  limit 1;

  if found then
    raise exception '이미 다른 계정에서 승인된 사업자등록번호입니다.';
  end if;

  select id
  into v_existing_id
  from public.store_verification_requests
  where business_number = v_business_number
    and status in ('pending', 'approved')
    and user_id <> auth.uid()
  limit 1;

  if found then
    raise exception '이미 신청 또는 승인된 사업자등록번호입니다.';
  end if;

  select *
  into v_request
  from public.store_verification_requests
  where user_id = auth.uid()
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.store_verification_requests
    set
      business_number = v_business_number,
      store_name = trim(p_store_name),
      representative_name = nullif(trim(coalesce(p_representative_name, '')), ''),
      phone = trim(coalesce(p_phone, '')),
      store_address = nullif(trim(coalesce(p_store_address, '')), ''),
      store_latitude = p_store_latitude,
      store_longitude = p_store_longitude,
      document_path = p_document_path,
      document_mime_type = p_document_mime_type,
      admin_note = null,
      reviewed_by = null,
      reviewed_at = null,
      updated_at = now()
    where id = v_request.id
    returning * into v_request;
  else
    insert into public.store_verification_requests (
      user_id,
      business_number,
      store_name,
      representative_name,
      phone,
      store_address,
      store_latitude,
      store_longitude,
      document_path,
      document_mime_type
    )
    values (
      auth.uid(),
      v_business_number,
      trim(p_store_name),
      nullif(trim(coalesce(p_representative_name, '')), ''),
      trim(coalesce(p_phone, '')),
      nullif(trim(coalesce(p_store_address, '')), ''),
      p_store_latitude,
      p_store_longitude,
      p_document_path,
      p_document_mime_type
    )
    returning * into v_request;
  end if;

  perform set_config('app.store_verification_internal', 'true', true);

  update public.profiles
  set
    display_name = trim(p_store_name),
    phone = trim(coalesce(p_phone, '')),
    is_phone_public = false,
    business_number = v_business_number,
    business_verified = false,
    business_verified_at = null,
    store_verification_status = 'pending',
    store_address = nullif(trim(coalesce(p_store_address, '')), ''),
    store_latitude = p_store_latitude,
    store_longitude = p_store_longitude,
    updated_at = now()
  where id = auth.uid();

  return v_request;
end;
$$;

create or replace function public.cancel_store_verification_request()
returns public.store_verification_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.store_verification_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select *
  into v_request
  from public.store_verification_requests
  where user_id = auth.uid()
    and status in ('pending', 'needs_more_info')
  order by created_at desc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  update public.store_verification_requests
  set
    status = 'canceled',
    updated_at = now()
  where id = v_request.id
  returning * into v_request;

  perform set_config('app.store_verification_internal', 'true', true);

  update public.profiles
  set
    store_verification_status = 'canceled',
    business_verified = false,
    business_verified_at = null,
    is_phone_public = false,
    updated_at = now()
  where id = auth.uid()
    and not coalesce(business_verified, false);

  return v_request;
end;
$$;

create or replace function public.admin_review_store_verification_request(
  p_request_id bigint,
  p_status text,
  p_admin_note text default null
)
returns public.store_verification_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.store_verification_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception '관리자만 가게 인증 신청을 검수할 수 있습니다.';
  end if;

  if p_status not in ('approved', 'rejected', 'needs_more_info') then
    raise exception '유효하지 않은 검수 상태입니다.';
  end if;

  select *
  into v_request
  from public.store_verification_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception '가게 인증 신청을 찾을 수 없습니다.';
  end if;

  if v_request.status = 'canceled' then
    raise exception '취소된 신청은 검수할 수 없습니다.';
  end if;

  update public.store_verification_requests
  set
    status = p_status,
    admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id
  returning * into v_request;

  perform set_config('app.store_verification_internal', 'true', true);

  if p_status = 'approved' then
    if exists (
      select 1
      from public.profiles
      where id <> v_request.user_id
        and coalesce(business_verified, false)
        and business_number = v_request.business_number
    ) then
      raise exception '이미 다른 계정에서 승인된 사업자등록번호입니다.';
    end if;

    update public.store_verification_requests
    set
      status = 'rejected',
      admin_note = '동일 사업자등록번호의 다른 신청이 승인되어 자동 반려되었습니다.',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
    where id <> p_request_id
      and business_number = v_request.business_number
      and status = 'pending';

    update public.profiles
    set
      user_type = 'store',
      display_name = v_request.store_name,
      phone = v_request.phone,
      is_phone_public = false,
      business_number = v_request.business_number,
      business_verified = true,
      business_verified_at = now(),
      store_verification_status = 'approved',
      store_address = v_request.store_address,
      store_latitude = v_request.store_latitude,
      store_longitude = v_request.store_longitude,
      updated_at = now()
    where id = v_request.user_id;
  else
    update public.profiles
    set
      business_verified = false,
      business_verified_at = null,
      store_verification_status = p_status,
      is_phone_public = false,
      updated_at = now()
    where id = v_request.user_id
      and not coalesce(business_verified, false);
  end if;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_review_store_verification_request',
    'store_verification_requests',
    p_request_id::text,
    jsonb_build_object(
      'status', p_status,
      'business_number', v_request.business_number,
      'user_id', v_request.user_id
    )
  );

  return v_request;
end;
$$;

create or replace function public.admin_revoke_store_verification(
  p_user_id uuid,
  p_admin_note text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_business_number text;
  v_note text := nullif(trim(coalesce(p_admin_note, '')), '');
begin
  if not public.is_admin() then
    raise exception '관리자만 가게 인증을 취소할 수 있습니다.';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception '회원 정보를 찾을 수 없습니다.';
  end if;

  if not coalesce(v_profile.business_verified, false) then
    raise exception '가게 인증이 완료된 계정이 아닙니다.';
  end if;

  v_business_number := v_profile.business_number;

  perform set_config('app.store_verification_internal', 'true', true);

  update public.store_verification_requests
  set
    status = 'rejected',
    admin_note = coalesce(v_note, '관리자가 가게 인증을 취소했습니다.'),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where user_id = p_user_id
    and status = 'approved';

  update public.profiles
  set
    user_type = 'personal',
    is_phone_public = false,
    business_number = null,
    business_verified = false,
    business_verified_at = null,
    store_verification_status = 'rejected',
    store_address = null,
    store_latitude = null,
    store_longitude = null,
    updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  insert into public.admin_logs (action, target_table, target_id, detail)
  values (
    'admin_revoke_store_verification',
    'profiles',
    p_user_id::text,
    jsonb_build_object(
      'business_number', v_business_number,
      'admin_note', v_note
    )
  );

  return v_profile;
end;
$$;

grant select, insert, update on public.store_verification_requests to authenticated;
grant usage, select on sequence public.store_verification_requests_id_seq to authenticated;
grant select, insert on public.admin_logs to authenticated;
grant usage, select on sequence public.admin_logs_id_seq to authenticated;
grant execute on function public.submit_store_verification_request(
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  text
) to authenticated;
grant execute on function public.cancel_store_verification_request() to authenticated;
grant execute on function public.admin_review_store_verification_request(bigint, text, text)
to authenticated;
grant execute on function public.admin_revoke_store_verification(uuid, text)
to authenticated;

select pg_notify('pgrst', 'reload schema');
