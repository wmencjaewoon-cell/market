import { supabase } from './supabase';
import { canStartChat } from './guard';
import { checkProhibitedContent } from './prohibited';

type SendMessageOptions = {
  skipProhibitedCheck?: boolean;
};

async function ensureRoomMembers(roomId: string, me: string, sellerId: string) {
  const { error } = await supabase
    .from('chat_room_members')
    .upsert(
      [
        { room_id: roomId, user_id: me },
        { room_id: roomId, user_id: sellerId },
      ],
      {
        onConflict: 'room_id,user_id',
        ignoreDuplicates: true,
      }
    );

  if (error) throw error;
}

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
    ensureRoomMembers(existingRoom.id, me, sellerId).catch((error) => {
      console.log('채팅방 멤버 복구 실패:', error);
    });
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
    });

    if (pushError) {
      console.log('푸시 알림 전송 실패:', pushError);
    }
  } catch (e) {
    console.log('푸시 알림 호출 실패:', e);
  }
}

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

export async function getMyUserId() {
  const { data: authData } = await supabase.auth.getUser();
  return authData.user?.id ?? null;
}

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
