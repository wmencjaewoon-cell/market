// 가게 구독 제한 헬퍼: 상품 수, 직원 수, 공지/오늘가능/지도노출 권한을 서버 RPC에서 읽는다.
import { supabase } from './supabase';

export type StoreSubscriptionLimits = {
  plan: string;
  isPremium: boolean;
  hasLocalAd: boolean;
  staffLimit: number | null;
  productLimit: number;
  estimateRecentLimit: number | null;
  statsRecentDays: number | null;
  canCopyProduct: boolean;
  canStoreNotice: boolean;
  canTodayBadge: boolean;
  mapHighlight: boolean;
  recommendedExposure: boolean;
};

export const DEFAULT_STORE_LIMITS: StoreSubscriptionLimits = {
  plan: 'free',
  isPremium: false,
  hasLocalAd: false,
  staffLimit: 5,
  productLimit: 10,
  estimateRecentLimit: 10,
  statsRecentDays: 30,
  canCopyProduct: false,
  canStoreNotice: false,
  canTodayBadge: false,
  mapHighlight: false,
  recommendedExposure: false,
};

/**
 * Supabase RPC 결과를 앱에서 쓰는 제한 객체로 변환한다.
 *
 * DB 마이그레이션 적용 상태에 따라 숫자 컬럼이 문자열/number/null로 섞여 들어올 수 있으므로
 * 화면에서는 이 함수가 만든 값만 사용한다. 특히 `null`은 "무제한"이라는 의미이고,
 * `0`은 실제로 0개만 허용한다는 의미라서 둘을 섞으면 안 된다.
 */
function normalizeLimits(row: any): StoreSubscriptionLimits {
  if (!row) return DEFAULT_STORE_LIMITS;

  return {
    plan: row.plan || DEFAULT_STORE_LIMITS.plan,
    isPremium: Boolean(row.is_premium),
    hasLocalAd: Boolean(row.has_local_ad),
    staffLimit:
      row.staff_limit == null ? null : Number(row.staff_limit),
    productLimit: Number(row.product_limit ?? DEFAULT_STORE_LIMITS.productLimit),
    estimateRecentLimit:
      row.estimate_recent_limit == null ? null : Number(row.estimate_recent_limit),
    statsRecentDays:
      row.stats_recent_days == null ? null : Number(row.stats_recent_days),
    canCopyProduct: Boolean(row.can_copy_product),
    canStoreNotice: Boolean(row.can_store_notice),
    canTodayBadge: Boolean(row.can_today_badge),
    mapHighlight: Boolean(row.map_highlight),
    recommendedExposure: Boolean(row.recommended_exposure),
  };
}

/**
 * 현재 가게의 구독 제한을 서버 RPC에서 가져온다.
 *
 * 클라이언트에서 plan 이름만 보고 직접 권한을 판단하면 admin 수동 부여,
 * 지역광고 추가 구독, 향후 결제 상태 변경을 놓칠 수 있다. 그래서 상품 수,
 * 직원 수, 공지/오늘가능/지도 강조 같은 모든 UI 권한은 이 함수 결과를 기준으로 한다.
 *
 * RPC가 없거나 실패하면 무료 제한으로 닫는다. 이렇게 해야 새 앱이 구버전 DB를 만났을 때
 * 유료 기능이 잘못 열리는 쪽보다 기능이 잠기는 쪽으로 실패한다.
 */
export async function getStoreSubscriptionLimits(
  storeUserId?: string | null
): Promise<StoreSubscriptionLimits> {
  if (!storeUserId) return DEFAULT_STORE_LIMITS;

  const { data, error } = await supabase.rpc('get_store_subscription_limits', {
    p_store_user_id: storeUserId,
  });

  if (error) {    return DEFAULT_STORE_LIMITS;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return normalizeLimits(row);
}

/**
 * 화면에 표시할 요금제 이름을 한글로 변환한다.
 * 실제 권한 판단에는 쓰지 말고, 뱃지/요금제 모달 같은 표시용으로만 사용한다.
 */
export function getPlanLabel(plan?: string | null) {
  if (plan === 'premium') return '프리미엄';
  if (plan === 'basic') return '베이직';
  if (plan === 'local_ad') return '지역광고';
  if (plan === 'partner') return '파트너';
  return '무료';
}

/**
 * 제한값을 사람이 읽는 문구로 바꾼다.
 * `null`은 서버에서 내려주는 무제한 표시 규칙이므로 숫자 0과 다르게 처리한다.
 */
export function formatLimit(value: number | null, unit: string) {
  return value == null ? '무제한' : `${value}${unit}`;
}
