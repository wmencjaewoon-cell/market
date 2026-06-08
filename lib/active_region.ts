import { supabase } from './supabase';
import {
  fetchMyRegions,
  fetchMyRegionSettings,
  saveMyRegionSettings,
} from './region';

export async function getMyActiveRegion() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    throw new Error('로그인이 필요합니다.');
  }

  const regions = await fetchMyRegions();
  const settings = await fetchMyRegionSettings();

  if (regions.length === 0) {
    throw new Error('대표 지역을 먼저 설정해 주세요.');
  }

  const activeRegion =
    regions.find((region: any) => region.id === settings?.active_region_id) ||
    regions[0];

  if (!activeRegion?.id) {
    throw new Error('대표 지역 정보를 찾을 수 없습니다.');
  }

  if (settings?.active_region_id !== activeRegion.id) {
    await saveMyRegionSettings(activeRegion.id, settings?.radius_km ?? 5);
  }

  if (!activeRegion.region_name) {
    throw new Error('대표 지역 정보를 찾을 수 없습니다.');
  }

  return activeRegion;
}
