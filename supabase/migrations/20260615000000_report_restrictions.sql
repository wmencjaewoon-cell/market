-- Report based account restrictions.
-- Run after the base reports/profiles/listings/chat tables exist.

alter table public.profiles
  add column if not exists restricted_until timestamptz,
  add column if not exists restriction_reason text;

create index if not exists profiles_restricted_until_idx
on public.profiles (restricted_until)
where status = 'suspended';

create or replace function public.refresh_expired_user_restriction(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    status = 'active',
    can_create_listing = true,
    can_start_chat = true,
    restricted_until = null,
    restriction_reason = null,
    updated_at = now()
  where id = p_user_id
    and status = 'suspended'
    and restriction_reason = 'reports'
    and restricted_until is not null
    and restricted_until <= now();
end;
$$;

create or replace function public.get_user_restriction_message(
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if p_user_id is null then
    return '로그인이 필요합니다.';
  end if;

  perform public.refresh_expired_user_restriction(p_user_id);

  select *
  into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    return '회원 정보를 찾을 수 없습니다.';
  end if;

  if coalesce(v_profile.status, 'active') = 'deletion_pending' then
    return '탈퇴 대기 중인 계정입니다. 탈퇴를 취소해야 이용할 수 있습니다.';
  end if;

  if coalesce(v_profile.status, 'active') = 'blocked' then
    return '신고 누적으로 영구 이용제한된 계정입니다.';
  end if;

  if coalesce(v_profile.status, 'active') = 'suspended' then
    if v_profile.restricted_until is null or v_profile.restricted_until > now() then
      return '신고 누적으로 ' ||
        coalesce(
          to_char(v_profile.restricted_until at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
          '제한 해제 시점'
        ) ||
        '까지 이용이 제한된 계정입니다.';
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.ensure_user_can_use_app(
  p_user_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message text;
begin
  v_message := public.get_user_restriction_message(p_user_id);

  if v_message is not null then
    raise exception using message = v_message;
  end if;
end;
$$;

create or replace function public.apply_report_restriction(
  p_user_id uuid,
  p_extend boolean default true
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_report_count integer := 0;
  v_until timestamptz;
begin
  if p_user_id is null then
    return null;
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return null;
  end if;

  select count(*)::integer
  into v_report_count
  from public.reports
  where target_user_id = p_user_id;

  if coalesce(v_profile.status, 'active') = 'deletion_pending' then
    update public.profiles
    set
      reports_count = v_report_count,
      updated_at = now()
    where id = p_user_id
    returning * into v_profile;

    return v_profile;
  end if;

  if v_report_count >= 10 then
    update public.profiles
    set
      reports_count = v_report_count,
      status = 'blocked',
      can_create_listing = false,
      can_start_chat = false,
      restricted_until = null,
      restriction_reason = 'reports',
      updated_at = now()
    where id = p_user_id
    returning * into v_profile;

    return v_profile;
  end if;

  if v_report_count >= 5 then
    v_until := case
      when p_extend then greatest(coalesce(v_profile.restricted_until, now()), now() + interval '7 days')
      else coalesce(v_profile.restricted_until, now() + interval '7 days')
    end;

    update public.profiles
    set
      reports_count = v_report_count,
      status = 'suspended',
      can_create_listing = false,
      can_start_chat = false,
      restricted_until = v_until,
      restriction_reason = 'reports',
      updated_at = now()
    where id = p_user_id
    returning * into v_profile;

    return v_profile;
  end if;

  if v_report_count >= 3 then
    v_until := case
      when p_extend then greatest(coalesce(v_profile.restricted_until, now()), now() + interval '1 day')
      else coalesce(v_profile.restricted_until, now() + interval '1 day')
    end;

    update public.profiles
    set
      reports_count = v_report_count,
      status = 'suspended',
      can_create_listing = false,
      can_start_chat = false,
      restricted_until = v_until,
      restriction_reason = 'reports',
      updated_at = now()
    where id = p_user_id
    returning * into v_profile;

    return v_profile;
  end if;

  if coalesce(v_profile.restriction_reason, '') = 'reports' then
    update public.profiles
    set
      reports_count = v_report_count,
      status = 'active',
      can_create_listing = true,
      can_start_chat = true,
      restricted_until = null,
      restriction_reason = null,
      updated_at = now()
    where id = p_user_id
    returning * into v_profile;

    return v_profile;
  end if;

  update public.profiles
  set
    reports_count = v_report_count,
    updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.handle_report_insert_restriction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_report_restriction(new.target_user_id, true);
  return new;
end;
$$;

create or replace function public.handle_report_delete_restriction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_report_restriction(old.target_user_id, false);
  return old;
end;
$$;

create or replace function public.enforce_row_user_can_use_app()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_column_name text := tg_argv[0];
  v_user_id_text text;
  v_user_id uuid;
begin
  v_user_id_text := to_jsonb(new) ->> v_column_name;
  v_user_id := coalesce(nullif(v_user_id_text, '')::uuid, auth.uid());

  if tg_op = 'UPDATE' and auth.uid() is distinct from v_user_id then
    return new;
  end if;

  perform public.ensure_user_can_use_app(v_user_id);
  return new;
end;
$$;

create or replace function public.handle_profile_deletion_cancel_report_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'deletion_pending' and new.status <> 'deletion_pending' then
    perform public.apply_report_restriction(new.id, false);
  end if;

  return new;
end;
$$;

do $$
begin
  execute 'drop trigger if exists profiles_report_sync_after_deletion_cancel on public.profiles';
  execute 'create trigger profiles_report_sync_after_deletion_cancel after update on public.profiles for each row execute function public.handle_profile_deletion_cancel_report_sync()';

  if to_regclass('public.reports') is not null then
    execute 'alter table public.reports enable row level security';

    execute 'drop policy if exists reports_insert_own on public.reports';
    execute 'create policy reports_insert_own on public.reports for insert with check (reporter_id = auth.uid() and target_user_id <> auth.uid())';
    execute 'grant insert on public.reports to authenticated';

    if to_regclass('public.reports_id_seq') is not null then
      execute 'grant usage, select on sequence public.reports_id_seq to authenticated';
    end if;

    execute 'drop trigger if exists reports_restrict_reporter_before_insert on public.reports';
    execute 'create trigger reports_restrict_reporter_before_insert before insert on public.reports for each row execute function public.enforce_row_user_can_use_app(''reporter_id'')';

    execute 'drop trigger if exists reports_apply_restriction_after_insert on public.reports';
    execute 'create trigger reports_apply_restriction_after_insert after insert on public.reports for each row execute function public.handle_report_insert_restriction()';

    execute 'drop trigger if exists reports_apply_restriction_after_delete on public.reports';
    execute 'create trigger reports_apply_restriction_after_delete after delete on public.reports for each row execute function public.handle_report_delete_restriction()';
  end if;

  if to_regclass('public.listings') is not null then
    execute 'drop trigger if exists listings_restrict_author_before_insert on public.listings';
    execute 'create trigger listings_restrict_author_before_insert before insert on public.listings for each row execute function public.enforce_row_user_can_use_app(''author_id'')';

    execute 'drop trigger if exists listings_restrict_author_before_update on public.listings';
    execute 'create trigger listings_restrict_author_before_update before update on public.listings for each row execute function public.enforce_row_user_can_use_app(''author_id'')';
  end if;

  if to_regclass('public.chat_rooms') is not null then
    execute 'drop trigger if exists chat_rooms_restrict_creator_before_insert on public.chat_rooms';
    execute 'create trigger chat_rooms_restrict_creator_before_insert before insert on public.chat_rooms for each row execute function public.enforce_row_user_can_use_app(''created_by'')';
  end if;

  if to_regclass('public.chat_messages') is not null then
    execute 'drop trigger if exists chat_messages_restrict_sender_before_insert on public.chat_messages';
    execute 'create trigger chat_messages_restrict_sender_before_insert before insert on public.chat_messages for each row execute function public.enforce_row_user_can_use_app(''sender_id'')';
  end if;

  if to_regclass('public.reviews') is not null then
    execute 'drop trigger if exists reviews_restrict_reviewer_before_insert on public.reviews';
    execute 'create trigger reviews_restrict_reviewer_before_insert before insert on public.reviews for each row execute function public.enforce_row_user_can_use_app(''reviewer_id'')';
  end if;

  if to_regclass('public.favorites') is not null then
    execute 'drop trigger if exists favorites_restrict_user_before_insert on public.favorites';
    execute 'create trigger favorites_restrict_user_before_insert before insert on public.favorites for each row execute function public.enforce_row_user_can_use_app(''user_id'')';
  end if;

  if to_regclass('public.keyword_alerts') is not null then
    execute 'drop trigger if exists keyword_alerts_restrict_user_before_insert on public.keyword_alerts';
    execute 'create trigger keyword_alerts_restrict_user_before_insert before insert on public.keyword_alerts for each row execute function public.enforce_row_user_can_use_app(''user_id'')';
  end if;

  if to_regclass('public.hidden_listings') is not null then
    execute 'drop trigger if exists hidden_listings_restrict_user_before_insert on public.hidden_listings';
    execute 'create trigger hidden_listings_restrict_user_before_insert before insert on public.hidden_listings for each row execute function public.enforce_row_user_can_use_app(''user_id'')';
  end if;

  if to_regclass('public.user_blocks') is not null then
    execute 'drop trigger if exists user_blocks_restrict_blocker_before_insert on public.user_blocks';
    execute 'create trigger user_blocks_restrict_blocker_before_insert before insert on public.user_blocks for each row execute function public.enforce_row_user_can_use_app(''blocker_id'')';
  end if;
end $$;

revoke all on function public.refresh_expired_user_restriction(uuid) from public;
revoke all on function public.get_user_restriction_message(uuid) from public;
revoke all on function public.ensure_user_can_use_app(uuid) from public;
revoke all on function public.apply_report_restriction(uuid, boolean) from public;

grant execute on function public.refresh_expired_user_restriction(uuid) to authenticated;
grant execute on function public.get_user_restriction_message(uuid) to authenticated;
grant execute on function public.ensure_user_can_use_app(uuid) to authenticated;
