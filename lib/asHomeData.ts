import { supabase } from './supabase';

export type AsHomeReview = {
  id: number;
  target_user_id: string;
  sentiment: string;
  comment: string | null;
  created_at: string;
  storeName: string;
  images: { image_path: string; sort_order: number | null }[];
};

// 기존 공개 가게 후기만 사용한다. 평점/영수증 인증/수리 전후 구분을 임의로 표시하지 않는다.
export async function fetchAsHomeReviews(): Promise<AsHomeReview[]> {
  const { data, error } = await supabase.from('reviews')
    .select('id, target_user_id, sentiment, comment, created_at, review_images(image_path, sort_order)')
    .order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  if (!data?.length) return [];
  const ids = [...new Set(data.map((item) => item.target_user_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data: stores, error: storeError } = await supabase.from('profiles')
    .select('id, display_name').in('id', ids).eq('user_type', 'store').eq('business_verified', true);
  if (storeError) throw storeError;
  const names = new Map((stores || []).map((store) => [store.id, store.display_name || '가게']));
  return data.filter((item) => names.has(item.target_user_id)).slice(0, 2).map((item) => ({
    id: item.id, target_user_id: item.target_user_id, sentiment: item.sentiment,
    comment: item.comment, created_at: item.created_at, storeName: names.get(item.target_user_id)!,
    images: [...(item.review_images || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).slice(0, 2),
  }));
}
