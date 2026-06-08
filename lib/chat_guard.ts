import { getCurrentCoords, getDistanceKm } from './region';
import { supabase } from './supabase';

export async function canChatToListing(listing: any, currentUserId?: string) {
  let userId = currentUserId;

  if (!userId) {
    const { data: authData } = await supabase.auth.getUser();
    userId = authData.user?.id;
  }

  if (!userId) {
    return { ok: false, reason: '로그인이 필요합니다.' };
  }

  const { data: myRegions, error } = await supabase
    .from('user_regions')
    .select('region_name, latitude, longitude')
    .eq('user_id', userId);

  if (error) throw error;

  const regions = myRegions || [];
  const sameRegisteredRegion = regions.some(
    (r: any) => r.region_name === listing.region
  );

  if (sameRegisteredRegion) {
    return { ok: true };
  }

  const closeRegisteredRegion = regions.some((region: any) => {
    const km = getDistanceKm(
      region.latitude,
      region.longitude,
      listing.latitude,
      listing.longitude
    );

    return km != null && km <= 3;
  });

  if (closeRegisteredRegion) {
    return { ok: true };
  }

  const coords = await getCurrentCoords();

  const km = getDistanceKm(
    coords.latitude,
    coords.longitude,
    listing.latitude,
    listing.longitude
  );

  if (km != null && km <= 3) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: '동네 인증이 필요하거나, 게시글 위치와 너무 멀어요.',
  };
}
