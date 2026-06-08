import { supabase } from './supabase';

export type GuardResult = {
  ok: boolean;
  reason?: string;
};

export async function getMyProfile() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  return data;
}

export async function canCreateListing(): Promise<GuardResult> {
  const profile = await getMyProfile();

  if (!profile) {
    return { ok: false, reason: '로그인이 필요합니다.' };
  }

  if (profile.status === 'blocked' || profile.status === 'suspended') {
    return { ok: false, reason: '이용이 제한된 계정입니다.' };
  }

  if (!profile.can_create_listing) {
    return { ok: false, reason: '현재 게시글 등록이 제한되어 있습니다.' };
  }

  return { ok: true };
}

export async function canStartChat(): Promise<GuardResult> {
  const profile = await getMyProfile();

  if (!profile) {
    return { ok: false, reason: '로그인이 필요합니다.' };
  }

  if (profile.status === 'blocked' || profile.status === 'suspended') {
    return { ok: false, reason: '이용이 제한된 계정입니다.' };
  }

  if (!profile.can_start_chat) {
    return { ok: false, reason: '현재 채팅 시작이 제한되어 있습니다.' };
  }

  return { ok: true };
}