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
    });

    if (error) {
      console.log('키워드 알림 전송 실패:', error);
    }
  } catch (e) {
    console.log('키워드 알림 호출 실패:', e);
  }
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
    );

    if (error) {
      console.log('관심 게시글 변경 알림 실패:', error);
    }
  } catch (e) {
    console.log('관심 게시글 변경 알림 호출 실패:', e);
  }
}