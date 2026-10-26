export type EstimateNotificationData = {
  estimateRequestId?: number | string;
  storeUserId?: string | null;
  targetScreen?: 'admin_estimates' | 'store_estimates';
};

export function normalizeEstimateRequestId(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// 푸시와 앱 알림 목록에서 동일한 경로를 사용한다. 기존 알림의 storeUserId:null도 관리자 접수 건이다.
// 화면 이동 대상만 정하며, 관리자 권한은 /admin의 인증 검사와 DB RLS에서 계속 확인한다.
export function getEstimateNotificationRoute(data?: EstimateNotificationData | null) {
  const forAdmin = data?.targetScreen === 'admin_estimates'
    || (data?.targetScreen !== 'store_estimates' && data?.storeUserId === null);
  const requestId = normalizeEstimateRequestId(data?.estimateRequestId);
  if (forAdmin) {
    return `/admin?tab=estimates${requestId ? `&requestId=${requestId}` : ''}`;
  }
  return `/store/estimates${requestId ? `?requestId=${requestId}` : ''}`;
}
