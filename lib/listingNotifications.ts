// 게시글 알림 헬퍼: 새 게시글/관심글 변경 시 알림 테이블과 푸시 발송을 연결한다.
import { supabase } from './supabase';

export async function sendKeywordAlertsForListing(params: {
  listingId: number;
  title: string;
  content?: string | null;
  region?: string | null;
  authorId: string;
}) {
  try {
    const { error } = await supabase.functions.invoke('send-keyword-alerts', {
      body: params,
    });  } catch {  }
}

export async function sendFavoriteListingUpdate(params: {
  listingId: number;
  authorId: string;
  title: string;
  changeType: 'price' | 'content';
  oldPrice?: string | null;
  newPrice?: string | null;
}) {
  try {
    const { error } = await supabase.functions.invoke(
      'send-favorite-listing-update',
      {
        body: params,
      }
    );  } catch {  }
}
