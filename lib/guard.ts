import { supabase } from './supabase';

export type GuardResult = {
  ok: boolean;
  reason?: string;
};

type ProfileRestriction = {
  status?: string | null;
  can_create_listing?: boolean | null;
  can_start_chat?: boolean | null;
  reports_count?: number | null;
  restricted_until?: string | null;
  restriction_reason?: string | null;
};

function formatRestrictionUntil(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRestrictionReason(profile: ProfileRestriction) {
  const status = profile.status ?? 'active';

  if (status === 'deletion_pending') {
    return '탈퇴 대기 중인 계정입니다. 탈퇴를 취소해야 이용할 수 있습니다.';
  }

  if (status === 'blocked') {
    return '신고 누적으로 영구 이용제한된 계정입니다.';
  }

  if (status === 'suspended') {
    const restrictedUntil = profile.restricted_until
      ? new Date(profile.restricted_until)
      : null;

    if (restrictedUntil && restrictedUntil.getTime() <= Date.now()) {
      return null;
    }

    const untilText = formatRestrictionUntil(profile.restricted_until);

    return untilText
      ? `신고 누적으로 ${untilText}까지 이용이 제한된 계정입니다.`
      : '신고 누적으로 이용이 제한된 계정입니다.';
  }

  return null;
}

function isExpiredReportSuspension(profile: ProfileRestriction) {
  if (profile.status !== 'suspended') return false;
  if (profile.restriction_reason && profile.restriction_reason !== 'reports') return false;
  if (!profile.restricted_until) return false;

  const restrictedUntil = new Date(profile.restricted_until);
  return !Number.isNaN(restrictedUntil.getTime()) && restrictedUntil.getTime() <= Date.now();
}

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

  const restrictionReason = getRestrictionReason(profile);

  if (restrictionReason) {
    return { ok: false, reason: restrictionReason };
  }

  if (!profile.can_create_listing && !isExpiredReportSuspension(profile)) {
    return { ok: false, reason: '현재 게시글 등록이 제한되어 있습니다.' };
  }

  return { ok: true };
}

export async function canStartChat(): Promise<GuardResult> {
  const profile = await getMyProfile();

  if (!profile) {
    return { ok: false, reason: '로그인이 필요합니다.' };
  }

  const restrictionReason = getRestrictionReason(profile);

  if (restrictionReason) {
    return { ok: false, reason: restrictionReason };
  }

  if (!profile.can_start_chat && !isExpiredReportSuspension(profile)) {
    return { ok: false, reason: '현재 채팅 시작이 제한되어 있습니다.' };
  }

  return { ok: true };
}

export async function canUseApp(): Promise<GuardResult> {
  const profile = await getMyProfile();

  if (!profile) {
    return { ok: false, reason: '로그인이 필요합니다.' };
  }

  const restrictionReason = getRestrictionReason(profile);

  if (restrictionReason) {
    return { ok: false, reason: restrictionReason };
  }

  return { ok: true };
}
