-- Allow project chat owners/managers to remove participants without deleting chat history.

create or replace function public.remove_project_chat_participant(
  p_room_id uuid,
  p_member_user_id uuid,
  p_project_member_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_store_user_id uuid;
  v_room_created_by uuid;
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_member_user_id is null then
    raise exception '내보낼 참여자를 찾을 수 없습니다.';
  end if;

  if p_member_user_id = auth.uid() then
    raise exception '본인은 내보낼 수 없습니다.';
  end if;

  select cr.project_id, p.store_user_id, cr.created_by
  into v_project_id, v_store_user_id, v_room_created_by
  from public.chat_rooms cr
  join public.store_projects p on p.id = cr.project_id
  where cr.id = p_room_id
    and cr.project_id is not null;

  if v_project_id is null then
    raise exception '현장 채팅방을 찾을 수 없습니다.';
  end if;

  if not (
    v_store_user_id = auth.uid()
    or v_room_created_by = auth.uid()
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = v_project_id
        and pm.member_user_id = auth.uid()
        and pm.invitation_status = 'accepted'
        and pm.role in ('owner', 'manager')
    )
  ) then
    raise exception '참여자를 내보낼 권한이 없습니다.';
  end if;

  select pm.role
  into v_target_role
  from public.project_members pm
  where pm.project_id = v_project_id
    and pm.member_user_id = p_member_user_id
    and coalesce(pm.invitation_status, '') <> 'removed'
  order by case when pm.role = 'owner' then 0 else 1 end
  limit 1;

  if p_member_user_id = v_store_user_id or v_target_role = 'owner' then
    raise exception '현장 소유자는 내보낼 수 없습니다.';
  end if;

  if p_project_member_id is not null then
    update public.project_members
    set invitation_status = 'removed'
    where id = p_project_member_id
      and project_id = v_project_id
      and member_user_id = p_member_user_id
      and coalesce(role, '') <> 'owner';
  else
    update public.project_members
    set invitation_status = 'removed'
    where project_id = v_project_id
      and member_user_id = p_member_user_id
      and coalesce(role, '') <> 'owner';
  end if;

  delete from public.chat_room_members
  where room_id = p_room_id
    and user_id = p_member_user_id;
end;
$$;

revoke all on function public.remove_project_chat_participant(uuid, uuid, uuid) from public;
grant execute on function public.remove_project_chat_participant(uuid, uuid, uuid) to authenticated;

delete from public.chat_room_members crm
using public.chat_rooms cr, public.project_members pm
where crm.room_id = cr.id
  and cr.project_id = pm.project_id
  and crm.user_id = pm.member_user_id
  and pm.invitation_status = 'removed';
