// 가게 직원/대표 권한 헬퍼: 현재 사용자가 어떤 가게를 어떤 권한으로 관리하는지 계산한다.
import { supabase } from './supabase';

export type StoreAccessContext = {
  currentUserId: string | null;
  currentProfile: any | null;
  storeUserId: string | null;
  storeProfile: any | null;
  membership: any | null;
  isStoreOwner: boolean;
  isManager: boolean;
  isStaff: boolean;
  canManageStore: boolean;
};

/**
 * 현재 로그인 사용자가 어떤 가게 권한으로 화면에 들어왔는지 계산한다.
 *
 * 가게 기능은 대표 계정과 직원 계정이 같은 화면을 공유한다. 화면마다 profiles,
 * store_staff_members를 직접 조합하면 어떤 화면은 대표 id로 저장하고 어떤 화면은
 * 직원 id로 저장하는 식의 버그가 나기 쉽다. 그래서 가게 화면은 먼저 이 함수를 호출해서
 * `storeUserId`를 실제 소유 가게 id로 확정한 뒤 조회/저장해야 한다.
 *
 * 반환값 해석:
 * - `currentUserId`: 실제 로그인한 계정 id
 * - `storeUserId`: 업무 데이터가 귀속될 가게 대표 계정 id
 * - `membership`: 직원으로 들어온 경우의 멤버십 row
 * - `canManageStore`: 대표 또는 매니저처럼 가게 설정을 바꿀 수 있는지
 */
export async function getMyStoreAccessContext(): Promise<StoreAccessContext> {
  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData.user?.id || null;

  if (!currentUserId) {
    return {
      currentUserId: null,
      currentProfile: null,
      storeUserId: null,
      storeProfile: null,
      membership: null,
      isStoreOwner: false,
      isManager: false,
      isStaff: false,
      canManageStore: false,
    };
  }

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUserId)
    .maybeSingle();

  const isStoreOwner =
    currentProfile?.user_type === 'store' &&
    !!currentProfile?.business_verified &&
    currentProfile?.status !== 'blocked';

  if (isStoreOwner) {
    // 대표 계정은 자기 profile id가 곧 가게 id다.
    // 직원 테이블을 거치지 않고 바로 전체 관리 권한을 부여한다.
    return {
      currentUserId,
      currentProfile: currentProfile || null,
      storeUserId: currentUserId,
      storeProfile: currentProfile || null,
      membership: null,
      isStoreOwner: true,
      isManager: true,
      isStaff: false,
      canManageStore: true,
    };
  }

  const { data: membership } = await supabase
    .from('store_staff_members')
    .select('*')
    .eq('staff_user_id', currentUserId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership?.store_user_id) {
    // 일반 사용자 또는 비활성 직원은 가게 업무 화면을 관리할 수 없다.
    // 화면에서는 이 상태를 보고 "가게 인증 필요" 안내를 보여준다.
    return {
      currentUserId,
      currentProfile: currentProfile || null,
      storeUserId: null,
      storeProfile: null,
      membership: null,
      isStoreOwner: false,
      isManager: false,
      isStaff: false,
      canManageStore: false,
    };
  }

  const { data: storeProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', membership.store_user_id)
    .maybeSingle();

  const isVerifiedStore =
    storeProfile?.user_type === 'store' &&
    !!storeProfile?.business_verified &&
    storeProfile?.status !== 'blocked';
  const isManager = membership.role === 'manager';

  // 직원은 소속 가게가 인증되어 있을 때만 storeUserId를 받는다.
  // 소속 가게가 차단/미인증 상태라면 직원 계정도 가게 업무 데이터에 접근시키지 않는다.
  return {
    currentUserId,
    currentProfile: currentProfile || null,
    storeUserId: isVerifiedStore ? membership.store_user_id : null,
    storeProfile: isVerifiedStore ? storeProfile || null : null,
    membership,
    isStoreOwner: false,
    isManager,
    isStaff: true,
    canManageStore: isVerifiedStore && isManager,
  };
}
