import { supabase } from './supabase';

// 기존 채팅의 약속잡기가 저장하는 메시지 형식이다. 희망일(desired_date)은 예약으로 취급하지 않는다.
const APPOINTMENT_PREFIX = '📅 약속 제안\n';
const PAGE_SIZE = 100;
const INACTIVE_STATUSES = new Set(['completed', 'canceled', 'cancelled', 'closed']);

export type AsHomeVisit = {
  roomId: string;
  requestId: number;
  title: string;
  storeName: string;
  storePhone: string | null;
  appointmentAt: number;
};

type Relation<T> = T | T[] | null;
type VisitRoom = {
  id: string;
  title: string | null;
  listing_id: number | null;
  store_user_id: string | null;
  workflow_status: string | null;
  completed_at: string | null;
  estimate_requests: Relation<{ id: number; user_id: string; title: string; status: string | null }>;
  store_projects: Relation<{ name: string; status: string | null }>;
  chat_room_members: { user_id: string }[];
  chat_messages: { id: string; message: string; created_at: string }[];
};

function first<T>(relation: Relation<T>): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export function parseVisitAppointment(message: string): number | null {
  if (!message.startsWith(APPOINTMENT_PREFIX)) return null;
  const match = message.slice(APPOINTMENT_PREFIX.length).trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  // 채팅과 동일한 로컬 시각. Date의 2/30 -> 3/2 자동 보정은 허용하지 않는다.
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date.getTime();
}

/** 본인의 문의이면서 현재 참여 중인 방만 읽는다. 접근 권한은 기존 Supabase RLS도 적용된다. */
export async function fetchAsHomeVisits(userId: string, now = new Date()): Promise<AsHomeVisit[]> {
  if (!userId) return [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const visits: (AsHomeVisit & { storeId: string })[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from('chat_rooms').select(`
      id, title, listing_id, store_user_id, workflow_status, completed_at,
      estimate_requests!inner (id, user_id, title, status),
      store_projects (name, status),
      chat_room_members!inner (user_id),
      chat_messages (id, message, created_at)
    `)
      .eq('estimate_requests.user_id', userId)
      .eq('chat_room_members.user_id', userId)
      .is('listing_id', null)
      .like('chat_messages.message', `${APPOINTMENT_PREFIX}%`)
      .order('id', { ascending: true })
      .order('created_at', { ascending: false, foreignTable: 'chat_messages' })
      .order('id', { ascending: false, foreignTable: 'chat_messages' })
      .limit(1, { foreignTable: 'chat_messages' })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    const rooms = (data ?? []) as unknown as VisitRoom[];
    for (const room of rooms) {
      const request = first(room.estimate_requests);
      const project = first(room.store_projects);
      if (!request || request.user_id !== userId || room.listing_id != null || !room.store_user_id
        || !room.chat_room_members.some(member => member.user_id === userId)
        || room.completed_at || [room.workflow_status, request.status, project?.status]
          .some(status => status && INACTIVE_STATUSES.has(status))) continue;

      // 먼저 최신 약속 한 건을 선택한 뒤 날짜를 검사해야 변경 전의 약속이 다시 나타나지 않는다.
      const appointmentAt = parseVisitAppointment(room.chat_messages[0]?.message ?? '');
      if (appointmentAt === null || appointmentAt < today.getTime()) continue;
      visits.push({
        roomId: room.id, requestId: request.id,
        title: room.title || project?.name || request.title,
        appointmentAt, storeId: room.store_user_id,
        storeName: '담당 가게', storePhone: null,
      });
    }
    if (rooms.length < PAGE_SIZE) break;
  }

  const storeIds = [...new Set(visits.map(visit => visit.storeId))];
  const stores = new Map<string, { display_name: string | null; phone: string | null }>();
  for (let offset = 0; offset < storeIds.length; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from('profiles').select('id, display_name, phone')
      .in('id', storeIds.slice(offset, offset + PAGE_SIZE)).eq('user_type', 'store');
    if (error) throw error;
    for (const store of data ?? []) stores.set(store.id, store);
  }

  return visits.sort((a, b) => a.appointmentAt - b.appointmentAt || a.roomId.localeCompare(b.roomId))
    .map(({ storeId, ...visit }) => {
      const store = stores.get(storeId);
      const phone = (store?.phone ?? '').replace(/[\s()-]/g, '');
      return {
        ...visit, storeName: store?.display_name || visit.storeName,
        storePhone: /^\+?\d{8,15}$/.test(phone) ? phone : null,
      };
    });
}
