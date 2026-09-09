// 가게 공개 노출 헬퍼: 프리미엄/지역광고 정보를 공개 화면의 배지와 정렬 점수로 변환한다.
import { supabase } from './supabase';

export type StorePublicExposure = {
  store_user_id: string;
  store_subscription_plan?: string | null;
  store_subscription_status?: string | null;
  is_premium?: boolean | null;
  has_local_ad?: boolean | null;
  map_highlight?: boolean | null;
  recommended_exposure?: boolean | null;
};

/**
 * 공개 화면에서 쓸 가게 노출 정보를 한 번에 조회한다.
 *
 * `store_subscriptions` 같은 결제/관리용 원본 테이블을 직접 읽지 않고
 * `store_public_exposure` view만 읽는다. 이 방식이면 홈, 검색, 지도 같은 공개 화면은
 * private한 결제 row 구조를 몰라도 프리미엄/지역광고 배지와 정렬 점수만 사용할 수 있다.
 *
 * staged 배포 중에는 앱 코드가 먼저 나가고 SQL view 컬럼이 나중에 적용될 수 있다.
 * 그래서 `has_local_ad` 컬럼이 아직 없으면 구버전 컬럼만 읽는 fallback 쿼리로 내려간다.
 */
export async function fetchStorePublicExposureMap(storeUserIds: Array<string | null | undefined>) {
  const ids = Array.from(
    new Set(storeUserIds.filter((id): id is string => !!id))
  );

  if (ids.length === 0) {
    return new Map<string, StorePublicExposure>();
  }

  const initialResult = await supabase
    .from('store_public_exposure')
    .select('store_user_id, store_subscription_plan, store_subscription_status, is_premium, has_local_ad, map_highlight, recommended_exposure')
    .in('store_user_id', ids);
  let data = initialResult.data as StorePublicExposure[] | null;
  let error = initialResult.error;

  if (error) {
    if (error.code === '42703' || error.message.includes('has_local_ad')) {
      const fallback = await supabase
        .from('store_public_exposure')
        .select('store_user_id, is_premium, map_highlight, recommended_exposure')
        .in('store_user_id', ids);

      data = fallback.data as StorePublicExposure[] | null;
      error = fallback.error;
    }
  }

  if (error) {    return new Map<string, StorePublicExposure>();
  }

  return new Map(
    (data || []).map((row) => [row.store_user_id, row])
  );
}

/**
 * profiles row에 공개 노출 flag를 합친다.
 *
 * 기존 화면들은 대부분 `profile` 객체 하나만 넘겨받아 뱃지와 정렬을 판단한다.
 * 이 함수로 `is_premium`, `has_local_ad`, `map_highlight` 값을 같은 객체에 붙여두면
 * 화면마다 별도 exposure map을 계속 들고 다니지 않아도 된다.
 */
export function mergeStoreExposureIntoProfile(profile: any, exposure?: StorePublicExposure | null) {
  if (!profile) return profile;

  return {
    ...profile,
    store_subscription_plan:
      exposure?.store_subscription_plan ?? profile.store_subscription_plan,
    store_subscription_status:
      exposure?.store_subscription_status ?? profile.store_subscription_status,
    is_premium: !!exposure?.is_premium,
    has_local_ad: !!exposure?.has_local_ad,
    map_highlight: !!exposure?.map_highlight,
    recommended_exposure: !!exposure?.recommended_exposure,
  };
}

/**
 * 공개 화면에서 "프리미엄 가게" 뱃지를 보여도 되는지 판단한다.
 *
 * 인증되지 않은 가게는 plan 컬럼이 있더라도 공개 프리미엄으로 보지 않는다.
 * 현재는 admin이 인증가게에 프리미엄을 수동 부여하는 이벤트 흐름도 있어서
 * `is_premium` flag와 `store_subscription_plan/status`를 함께 허용한다.
 */
export function isPremiumStoreProfile(profile: any) {
  if (profile?.user_type !== 'store' || !profile?.business_verified) return false;

  return (
    profile?.is_premium === true ||
    (
      profile?.store_subscription_plan === 'premium' &&
      (profile?.store_subscription_status || 'active') === 'active'
    )
  );
}

/**
 * 지역광고 표시 여부를 판단한다.
 * 지역광고는 프리미엄과 별개 상품이라 `isPremiumStoreProfile`에 포함하지 않는다.
 */
export function hasLocalAdStoreProfile(profile: any) {
  if (profile?.user_type !== 'store' || !profile?.business_verified) return false;
  return profile?.has_local_ad === true;
}

/**
 * 공개 정렬용 노출 점수다. 점수가 높을수록 홈/검색/지도에서 앞쪽으로 간다.
 *
 * 현재 우선순위는 지역광고 2점, 프리미엄 1점이다. 두 상품을 모두 가진 가게는 3점이 되므로
 * 하나만 가진 가게보다 먼저 나온다. 세부 tie-breaker는 각 화면에서 최신순/거리순으로 처리한다.
 */
export function getStoreExposureScore(profile: any) {
  return Number(hasLocalAdStoreProfile(profile)) * 2 + Number(isPremiumStoreProfile(profile));
}

/**
 * 공지 등록/노출 가능 여부다.
 * 무료 가게는 공지 기능을 막고, 베이직 이상 또는 이벤트 프리미엄 flag가 있는 가게만 허용한다.
 */
export function canShowStoreNotice(profile: any) {
  if (profile?.user_type !== 'store' || !profile?.business_verified) return false;
  return (
    profile?.store_subscription_plan === 'basic' ||
    profile?.store_subscription_plan === 'premium' ||
    profile?.is_premium === true
  );
}
