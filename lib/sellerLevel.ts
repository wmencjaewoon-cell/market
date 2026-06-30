export const MAX_SELLER_LEVEL = 100;
export const SELLER_LEVEL_POINTS = 100;
export const TRADE_COMPLETED_POINTS = 10;
export const POSITIVE_REVIEW_POINTS = 15;
export const FAST_RESPONSE_POINTS = 5;
export const NO_CANCELLATION_POINTS = 3;
export const PROFILE_COMPLETED_POINTS = 5;
export const REPEATED_CANCELLATION_POINTS = -5;
export const REPORT_RECEIVED_POINTS = -10;
export const DISPUTE_POINTS = -15;
export const FALSE_LISTING_CONFIRMED_POINTS = -30;
export const ADMIN_WARNING_POINTS = -20;

export type SellerLevelStyleId =
  | 'clean'
  | 'fresh'
  | 'solid'
  | 'gold'
  | 'premium'
  | 'master'
  | 'legend';

export type SellerLevelStyle = {
  id: SellerLevelStyleId;
  minLevel: number;
  label: string;
  borderColor: string;
  backgroundColor: string;
  textColor: string;
};

export const SELLER_LEVEL_STYLES: SellerLevelStyle[] = [
  {
    id: 'clean',
    minLevel: 1,
    label: '기본',
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    textColor: '#374151',
  },
  {
    id: 'fresh',
    minLevel: 5,
    label: '새싹',
    borderColor: '#bbf7d0',
    backgroundColor: '#ecfdf5',
    textColor: '#15803d',
  },
  {
    id: 'solid',
    minLevel: 10,
    label: '신뢰',
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    textColor: '#2563eb',
  },
  {
    id: 'gold',
    minLevel: 25,
    label: '인기',
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    textColor: '#b45309',
  },
  {
    id: 'premium',
    minLevel: 50,
    label: '프리미엄',
    borderColor: '#ddd6fe',
    backgroundColor: '#f5f3ff',
    textColor: '#7c3aed',
  },
  {
    id: 'master',
    minLevel: 75,
    label: '마스터',
    borderColor: '#f76c6cff',
    backgroundColor: '#fef2f2',
    textColor: '#dc2626',
  },
  {
    id: 'legend',
    minLevel: 100,
    label: '레전드',
    borderColor: '#32c8ffff',
    backgroundColor: '#ecfdf5',
    textColor: '#07cce2ff',
  },
];

export function calculateSellerLevel(points?: number | null) {
  const safePoints = Math.max(0, Number(points || 0));
  return Math.min(MAX_SELLER_LEVEL, Math.floor(safePoints / SELLER_LEVEL_POINTS) + 1);
}

export function getSellerLevel(profile?: any | null, fallbackPoints = 0) {
  const rawLevel = Number(profile?.trust_level || 0);
  if (rawLevel > 0) {
    return Math.min(MAX_SELLER_LEVEL, Math.max(1, rawLevel));
  }

  return calculateSellerLevel(profile?.trust_points ?? fallbackPoints);
}

export function getSellerPoints(profile?: any | null, fallbackPoints = 0) {
  return Math.max(0, Number(profile?.trust_points ?? fallbackPoints ?? 0));
}

export function getSellerLevelTitle(level: number) {
  if (level >= 100) return '레전드 판매자';
  if (level >= 75) return '마스터 판매자';
  if (level >= 50) return '프리미엄 판매자';
  if (level >= 25) return '인기 판매자';
  if (level >= 10) return '신뢰 판매자';
  if (level >= 5) return '성장 판매자';
  return '새싹 판매자';
}

export function getSellerLevelProgress(points: number) {
  const safePoints = Math.max(0, Number(points || 0));
  const level = calculateSellerLevel(safePoints);

  if (level >= MAX_SELLER_LEVEL) {
    return {
      level,
      current: SELLER_LEVEL_POINTS,
      required: SELLER_LEVEL_POINTS,
      percent: 100,
      remaining: 0,
    };
  }

  const levelStart = (level - 1) * SELLER_LEVEL_POINTS;
  const current = safePoints - levelStart;
  const remaining = SELLER_LEVEL_POINTS - current;

  return {
    level,
    current,
    required: SELLER_LEVEL_POINTS,
    percent: Math.max(0, Math.min(100, (current / SELLER_LEVEL_POINTS) * 100)),
    remaining,
  };
}

export function getUnlockedSellerLevelStyles(level: number) {
  return SELLER_LEVEL_STYLES.filter((style) => style.minLevel <= level);
}

export function getSellerLevelStyle(profile?: any | null, fallbackLevel?: number) {
  const level = fallbackLevel ?? getSellerLevel(profile);
  const requestedId = profile?.seller_level_style || profile?.level_badge_style || 'clean';
  const requestedStyle = SELLER_LEVEL_STYLES.find((style) => style.id === requestedId);

  if (requestedStyle && requestedStyle.minLevel <= level) {
    return requestedStyle;
  }

  return SELLER_LEVEL_STYLES[0];
}
