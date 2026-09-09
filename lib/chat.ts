// 채팅 데이터 헬퍼: 방 생성, 메시지 전송, 읽음 처리, 안읽은 수 계산의 공통 진입점이다.
import { supabase } from './supabase';
import { canStartChat } from './guard';
import { checkProhibitedContent } from './prohibited';

type SendMessageOptions = {
  skipProhibitedCheck?: boolean;
};

/**
 * 채팅방 멤버십을 보정한다.
 *
 * 기존 방이 이미 있어도 `chat_room_members`가 누락되면 채팅 목록, 안읽은 수,
 * 푸시 대상 계산이 전부 틀어진다. 방을 만들거나 재사용할 때마다 upsert로
 * 구매자/판매자/담당 직원을 다시 보장한다.
 */
async function ensureRoomMembers(roomId: string, me: string, sellerId: string, staffId?: string | null) {
  const members = [
    { room_id: roomId, user_id: me },
    { room_id: roomId, user_id: sellerId },
  ];

  if (staffId && staffId !== me && staffId !== sellerId) {
    members.push({ room_id: roomId, user_id: staffId });
  }

  const { error } = await supabase
    .from('chat_room_members')
    .upsert(members, {
      onConflict: 'room_id,user_id',
      ignoreDuplicates: true,
    });

  if (error) throw error;
}

/**
 * 게시글 1:1 채팅방을 가져오거나 새로 만든다.
 *
 * 같은 사용자가 같은 게시글 판매자에게 여러 번 채팅을 눌러도 방이 중복 생성되지 않도록
 * `listing_id + created_by` 조합으로 기존 방을 찾는다. 내 글에는 채팅을 열 수 없고,
 * 차단/이용 제한 여부는 `canStartChat`에서 한 번 더 확인한다.
 */
export async function getOrCreateRoom(
  listingId: number,
  sellerId: string,
  currentUserId?: string
) {
  let me = currentUserId;

  if (!me) {
    const { data: authData } = await supabase.auth.getUser();
    me = authData.user?.id;
  }

  if (!me) throw new Error('로그인이 필요합니다.');

  if (me === sellerId) {
    throw new Error('내 글에는 채팅할 수 없습니다.');
  }

  const guard = await canStartChat();

  if (!guard.ok) {
    throw new Error(guard.reason || '채팅 이용이 제한된 계정입니다.');
  }

  const { data: existingRoom, error: existingError } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('listing_id', listingId)
    .eq('created_by', me)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existingRoom?.id) {
    ensureRoomMembers(existingRoom.id, me, sellerId).catch((error) => {    });
    return existingRoom.id;
  }

  const { data: room, error: roomError } = await supabase
    .from('chat_rooms')
    .insert({
      listing_id: listingId,
      created_by: me,
    })
    .select('id')
    .single();

  if (roomError) throw roomError;

  await ensureRoomMembers(room.id, me, sellerId);

  return room.id;
}

/**
 * 가게 프로필용 1:1 채팅방을 가져오거나 새로 만든다.
 *
 * 일반 게시글 방과 달리 `listing_id`, `project_id`, `estimate_request_id`,
 * `estimate_quote_id`가 모두 비어 있는 순수 가게 문의 방만 재사용한다.
 * 이 조건이 빠지면 견적/현장 채팅과 일반 가게 채팅이 섞일 수 있다.
 */
export async function getOrCreateStoreRoom(
  storeUserId: string,
  currentUserId?: string,
  assignedStaffUserId?: string | null
) {
  let me = currentUserId;

  if (!me) {
    const { data: authData } = await supabase.auth.getUser();
    me = authData.user?.id;
  }

  if (!me) throw new Error('로그인이 필요합니다.');

  if (me === storeUserId) {
    throw new Error('내 가게에는 채팅할 수 없습니다.');
  }

  const guard = await canStartChat();

  if (!guard.ok) {
    throw new Error(guard.reason || '채팅 이용이 제한된 계정입니다.');
  }

  const { data: existingRoom, error: existingError } = await supabase
    .from('chat_rooms')
    .select('id')
    .is('listing_id', null)
    .is('project_id', null)
    .is('estimate_request_id', null)
    .is('estimate_quote_id', null)
    .eq('store_user_id', storeUserId)
    .eq('created_by', me)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existingRoom?.id) {
    if (assignedStaffUserId) {
      supabase
        .from('chat_rooms')
        .update({ assigned_staff_user_id: assignedStaffUserId })
        .eq('id', existingRoom.id)
        .then(({ error }) => {        });
    }

    ensureRoomMembers(existingRoom.id, me, storeUserId, assignedStaffUserId).catch((error) => {    });
    return existingRoom.id;
  }

  const { data: room, error: roomError } = await supabase
    .from('chat_rooms')
    .insert({
      listing_id: null,
      store_user_id: storeUserId,
      room_type: 'store',
      assigned_staff_user_id: assignedStaffUserId || null,
      created_by: me,
    })
    .select('id')
    .single();

  if (roomError) throw roomError;

  await ensureRoomMembers(room.id, me, storeUserId, assignedStaffUserId);

  return room.id;
}

/**
 * 채팅 메시지를 저장하고 푸시 알림 Edge Function을 호출한다.
 *
 * 화면은 낙관적 렌더링 대신 Supabase realtime INSERT 구독으로 새 메시지를 받는다.
 * 그래서 여기서는 DB insert와 push 호출만 담당한다. 시스템 메시지나 약속/장소 메시지는
 * `skipProhibitedCheck`를 넘겨 금칙어 검사를 건너뛸 수 있다.
 */
export async function sendMessage(
  roomId: string,
  message: string,
  options: SendMessageOptions = {}
) {
  const { data: authData } = await supabase.auth.getUser();
  const senderId = authData.user?.id;

  if (!senderId) {
    throw new Error('로그인이 필요합니다.');
  }

  const guard = await canStartChat();

  if (!guard.ok) {
    throw new Error(guard.reason || '채팅 이용이 제한된 계정입니다.');
  }

  if (!options.skipProhibitedCheck) {
    const blockedKeyword = checkProhibitedContent(message);

    if (blockedKeyword) {
      throw new Error(
        `"${blockedKeyword}" 관련 판매금지 물품이나 내용은 채팅으로 보낼 수 없습니다.`
      );
    }
  }

  const { error } = await supabase.from('chat_messages').insert({
    room_id: roomId,
    sender_id: senderId,
    message,
  });

  if (error) throw error;

  try {
    const { error: pushError } = await supabase.functions.invoke('send-chat-push', {
      body: {
        roomId,
        senderId,
        message,
      },
    });  } catch {  }
}

/**
 * 현재 사용자가 아직 읽지 않은 상대 메시지를 읽음 처리한다.
 *
 * 읽음 row는 `message_id + user_id`로 중복 방지된다. 단체방 읽음 숫자는
 * 이 테이블을 기준으로 "대상 참여자 수 - 읽은 사람 수"로 계산한다.
 */
export async function markMessagesAsRead(roomId: string) {
  const { data: authData } = await supabase.auth.getUser();
  const me = authData.user?.id;
  if (!me) throw new Error('로그인이 필요합니다.');

  const { data: unreadMessages, error: unreadError } = await supabase
    .from('chat_messages')
    .select('id, sender_id')
    .eq('room_id', roomId)
    .neq('sender_id', me);

  if (unreadError) throw unreadError;

  if (!unreadMessages || unreadMessages.length === 0) return;

  const readRows = unreadMessages.map((msg) => ({
    message_id: msg.id,
    user_id: me,
  }));

  const { error } = await supabase
    .from('chat_message_reads')
    .upsert(readRows, {
      onConflict: 'message_id,user_id',
      ignoreDuplicates: true,
    });

  if (error) throw error;
}

/**
 * 로그인한 사용자 id만 필요한 곳에서 쓰는 작은 헬퍼다.
 * AuthContext 밖의 lib 함수에서 현재 계정을 확인할 때 사용한다.
 */
export async function getMyUserId() {
  const { data: authData } = await supabase.auth.getUser();
  return authData.user?.id ?? null;
}

/**
 * 하단 채팅탭 배지에 표시할 전체 안읽은 메시지 수를 계산한다.
 *
 * 먼저 내가 속한 방 id를 찾고, 그 방들에 있는 상대 메시지 중
 * `chat_message_reads`에 내 읽음 row가 없는 메시지만 센다.
 */
export async function getUnreadChatCount() {
  const { data: authData } = await supabase.auth.getUser();
  const me = authData.user?.id;

  if (!me) return 0;

  const { data: memberRows, error: memberError } = await supabase
    .from('chat_room_members')
    .select('room_id')
    .eq('user_id', me);

  if (memberError) throw memberError;

  const roomIds = (memberRows || []).map((row: any) => row.room_id);

  if (roomIds.length === 0) return 0;

  const { data: messages, error: messageError } = await supabase
    .from('chat_messages')
    .select('id, room_id, sender_id')
    .in('room_id', roomIds)
    .neq('sender_id', me);

  if (messageError) throw messageError;

  if (!messages || messages.length === 0) return 0;

  const messageIds = messages.map((msg: any) => msg.id);

  const { data: reads, error: readError } = await supabase
    .from('chat_message_reads')
    .select('message_id')
    .eq('user_id', me)
    .in('message_id', messageIds);

  if (readError) throw readError;

  const readSet = new Set((reads || []).map((r: any) => String(r.message_id)));

  return messages.filter((msg: any) => !readSet.has(String(msg.id))).length;
}

/**
 * 특정 채팅방 상세/목록 카드에서 쓸 안읽은 수를 계산한다.
 * 전체 배지와 같은 기준이지만 room 하나에만 제한한다.
 */
export async function getUnreadCountByRoom(roomId: string) {
  const { data: authData } = await supabase.auth.getUser();
  const me = authData.user?.id;

  if (!me) return 0;

  const { data: messages, error: messageError } = await supabase
    .from('chat_messages')
    .select('id')
    .eq('room_id', roomId)
    .neq('sender_id', me);

  if (messageError) throw messageError;

  if (!messages || messages.length === 0) return 0;

  const messageIds = messages.map((msg: any) => msg.id);

  const { data: reads, error: readError } = await supabase
    .from('chat_message_reads')
    .select('message_id')
    .eq('user_id', me)
    .in('message_id', messageIds);

  if (readError) throw readError;

  const readSet = new Set((reads || []).map((r: any) => String(r.message_id)));

  return messages.filter((msg: any) => !readSet.has(String(msg.id))).length;
}
