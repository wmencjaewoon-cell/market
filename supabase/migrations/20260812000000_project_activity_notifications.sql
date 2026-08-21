-- Notify project chat participants about schedule and daily-report activity.

create or replace function public.create_project_chat_activity_notifications(
  p_project_id uuid,
  p_room_id uuid,
  p_activity_type text,
  p_title text,
  p_body text,
  p_entity_id text default null,
  p_visible_to_customer boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_title text := left(coalesce(nullif(trim(p_title), ''), '현장 알림'), 120);
  v_body text := left(coalesce(nullif(trim(p_body), ''), '현장 변경사항이 있습니다.'), 500);
  v_actor_name text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_activity_type not in (
    'project_schedule_created',
    'project_schedule_updated',
    'project_daily_report_created'
  ) then
    raise exception '지원하지 않는 현장 알림 유형입니다.';
  end if;

  if not exists (
    select 1
    from public.chat_rooms cr
    where cr.id = p_room_id
      and cr.project_id = p_project_id
      and coalesce(cr.room_type, '') = 'project'
  ) then
    raise exception '현장 채팅방을 찾을 수 없습니다.';
  end if;

  if not exists (
    select 1
    from public.chat_room_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
  ) then
    raise exception '현장 채팅방 참여자만 알림을 보낼 수 있습니다.';
  end if;

  select display_name
  into v_actor_name
  from public.profiles
  where id = auth.uid();

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    data
  )
  select
    m.user_id,
    p_activity_type,
    v_title,
    v_body,
    jsonb_strip_nulls(jsonb_build_object(
      'projectId', p_project_id,
      'roomId', p_room_id,
      'entityId', p_entity_id,
      'activityType', p_activity_type,
      'actorId', auth.uid(),
      'actorName', v_actor_name
    ))
  from public.chat_room_members m
  left join public.chat_room_settings s
    on s.room_id = m.room_id
   and s.user_id = m.user_id
  where m.room_id = p_room_id
    and m.user_id is not null
    and m.user_id <> auth.uid()
    and coalesce(s.muted, false) = false
    and (
      p_activity_type <> 'project_daily_report_created'
      or p_visible_to_customer
      or exists (
        select 1
        from public.store_projects p
        where p.id = p_project_id
          and (
            p.store_user_id = m.user_id
            or p.assigned_staff_user_id = m.user_id
            or exists (
              select 1
              from public.store_staff_members sm
              where sm.store_user_id = p.store_user_id
                and sm.staff_user_id = m.user_id
                and sm.status = 'active'
            )
            or exists (
              select 1
              from public.project_members pm
              where pm.project_id = p.id
                and pm.member_user_id = m.user_id
                and pm.invitation_status = 'accepted'
                and pm.role in ('owner', 'manager', 'employee', 'partner')
            )
          )
      )
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.create_project_chat_activity_notifications(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  boolean
) from public;

grant execute on function public.create_project_chat_activity_notifications(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  boolean
) to authenticated;

select pg_notify('pgrst', 'reload schema');
