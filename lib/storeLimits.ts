import { supabase } from './supabase';

export type StoreSubscriptionLimits = {
  plan: string;
  isPremium: boolean;
  staffLimit: number | null;
  productLimit: number;
  estimateRecentLimit: number | null;
  statsRecentDays: number | null;
  mapHighlight: boolean;
  recommendedExposure: boolean;
};

export const DEFAULT_STORE_LIMITS: StoreSubscriptionLimits = {
  plan: 'free',
  isPremium: false,
  staffLimit: 5,
  productLimit: 10,
  estimateRecentLimit: 10,
  statsRecentDays: 30,
  mapHighlight: false,
  recommendedExposure: false,
};

function normalizeLimits(row: any): StoreSubscriptionLimits {
  if (!row) return DEFAULT_STORE_LIMITS;

  return {
    plan: row.plan || DEFAULT_STORE_LIMITS.plan,
    isPremium: Boolean(row.is_premium),
    staffLimit:
      row.staff_limit == null ? null : Number(row.staff_limit),
    productLimit: Number(row.product_limit ?? DEFAULT_STORE_LIMITS.productLimit),
    estimateRecentLimit:
      row.estimate_recent_limit == null ? null : Number(row.estimate_recent_limit),
    statsRecentDays:
      row.stats_recent_days == null ? null : Number(row.stats_recent_days),
    mapHighlight: Boolean(row.map_highlight),
    recommendedExposure: Boolean(row.recommended_exposure),
  };
}

export async function getStoreSubscriptionLimits(
  storeUserId?: string | null
): Promise<StoreSubscriptionLimits> {
  if (!storeUserId) return DEFAULT_STORE_LIMITS;

  const { data, error } = await supabase.rpc('get_store_subscription_limits', {
    p_store_user_id: storeUserId,
  });

  if (error) {
    console.log('가게 구독 제한 조회 실패:', error);
    return DEFAULT_STORE_LIMITS;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return normalizeLimits(row);
}

export function getPlanLabel(plan?: string | null) {
  if (plan === 'premium') return '프리미엄';
  if (plan === 'basic') return '베이직';
  if (plan === 'partner') return '파트너';
  return '무료';
}

export function formatLimit(value: number | null, unit: string) {
  return value == null ? '무제한' : `${value}${unit}`;
}
