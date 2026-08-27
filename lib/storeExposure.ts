import { supabase } from './supabase';

export type StorePublicExposure = {
  store_user_id: string;
  is_premium?: boolean | null;
  map_highlight?: boolean | null;
  recommended_exposure?: boolean | null;
};

export async function fetchStorePublicExposureMap(storeUserIds: Array<string | null | undefined>) {
  const ids = Array.from(
    new Set(storeUserIds.filter((id): id is string => !!id))
  );

  if (ids.length === 0) {
    return new Map<string, StorePublicExposure>();
  }

  const { data, error } = await supabase
    .from('store_public_exposure')
    .select('store_user_id, is_premium, map_highlight, recommended_exposure')
    .in('store_user_id', ids);

  if (error) {
    if (error.code !== 'PGRST205' && error.code !== '42P01') {
      console.log('가게 프리미엄 노출 정보 조회 실패:', error);
    }
    return new Map<string, StorePublicExposure>();
  }

  return new Map(
    ((data || []) as StorePublicExposure[]).map((row) => [row.store_user_id, row])
  );
}

export function mergeStoreExposureIntoProfile(profile: any, exposure?: StorePublicExposure | null) {
  if (!profile) return profile;

  return {
    ...profile,
    is_premium: !!exposure?.is_premium,
    map_highlight: !!exposure?.map_highlight,
    recommended_exposure: !!exposure?.recommended_exposure,
  };
}

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
