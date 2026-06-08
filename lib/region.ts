import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export async function fetchMyRegions() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return [];

  const { data, error } = await supabase
    .from('user_regions')
    .select('*')
    .eq('user_id', authData.user.id)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchMyRegionSettings() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  const { data, error } = await supabase
    .from('user_region_settings')
    .select('*')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function saveMyRegionSettings(activeRegionId: number | null, radiusKm: number) {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase
    .from('user_region_settings')
    .upsert({
      user_id: authData.user.id,
      active_region_id: activeRegionId,
      radius_km: radiusKm,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

export async function getCurrentCoords() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('위치 권한이 필요합니다.');
  }

  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: current.coords.latitude,
    longitude: current.coords.longitude,
  };
}

export async function addMyRegionByGps() {
  if (Platform.OS === 'web') {
    throw new Error('웹에서는 위치 인증 대신 지역 검색을 사용해 주세요.');
  }

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error('로그인이 필요합니다.');

  const regions = await fetchMyRegions();
  if (regions.length >= 3) {
    throw new Error('동네는 최대 3개까지 등록할 수 있습니다.');
  }

  const coords = await getCurrentCoords();

  const geocode = await Location.reverseGeocodeAsync(coords);
  const place = geocode?.[0];

  if (!place) {
    throw new Error('주소 변환 결과가 없습니다.');
  }

  const parts = [
  place.region,
  place.city,
  place.district,
  place.subregion,
  place.street,
  place.name,
].filter(Boolean);

const regionName = Array.from(new Set(parts)).join(' ').trim();

if (!regionName) {
  throw new Error('현재 위치의 동네 정보를 확인하지 못했습니다.');
}

  const duplicated = regions.find((r: any) => r.region_name === regionName);
  if (duplicated) {
    throw new Error('이미 등록된 동네입니다.');
  }

  const { data, error } = await supabase
    .from('user_regions')
    .insert({
      user_id: authData.user.id,
      region_name: regionName,
      latitude: coords.latitude,
      longitude: coords.longitude,
      verified: true,
    })
    .select()
    .single();

  if (error) throw error;

  const settings = await fetchMyRegionSettings();
  if (!settings?.active_region_id) {
    await saveMyRegionSettings(data.id, settings?.radius_km ?? 20);
  }

  return data;
}

export async function getNearbyRegionCandidatesByGps() {
  if (Platform.OS === 'web') {
    throw new Error('웹에서는 위치 인증 대신 지역 검색을 사용해 주세요.');
  }

  const coords = await getCurrentCoords();

  const { data, error } = await supabase
    .from('region_master')
    .select('*');

  if (error) throw error;

  const nearby = (data || [])
    .map((region: any) => ({
      region_name: region.full_name,
      full_name: region.full_name,
      latitude: region.latitude,
      longitude: region.longitude,
      verified: true,
      distance: getDistanceKm(
        coords.latitude,
        coords.longitude,
        region.latitude,
        region.longitude
      ),
    }))
    .filter((region: any) => region.distance != null && region.distance <= 8)
    .sort((a: any, b: any) => a.distance - b.distance)
    .slice(0, 20);

  if (nearby.length === 0) {
    throw new Error('현재 위치 주변 동네를 찾지 못했습니다.');
  }

  return nearby;
}

export async function addMyRegionByCandidate(candidate: {
  region_name: string;
  full_name?: string;
  latitude: number;
  longitude: number;
}) {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error('로그인이 필요합니다.');

  const regions = await fetchMyRegions();

  if (regions.length >= 3) {
    throw new Error('동네는 최대 3개까지 등록할 수 있습니다.');
  }

  const candidateName = candidate.full_name || candidate.region_name;

const duplicated = regions.find(
  (r: any) => r.region_name === candidateName
);

  if (duplicated) {
    await saveMyRegionSettings(duplicated.id, 5);
    return duplicated;
  }

  const { data, error } = await supabase
    .from('user_regions')
    .insert({
      user_id: authData.user.id,
      region_name: candidateName,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      verified: true,
    })
    .select()
    .single();

  if (error) throw error;

  await saveMyRegionSettings(data.id, 5);

  return data;
}

export async function searchRegionMaster(keyword: string) {
  const q = keyword.trim();

  if (!q) return [];

  const { data, error } = await supabase
    .from('region_master')
    .select('*')
    .or(`full_name.ilike.%${q}%,region_name.ilike.%${q}%`)
    .limit(30);

  console.log('동네 검색어:', q);
  console.log('동네 검색 결과:', data);
  console.log('동네 검색 에러:', error);

  if (error) throw error;

  return data || [];
}

export async function addMyRegionBySearch(region: {
  region_name: string;
  full_name: string;
  latitude: number;
  longitude: number;
}) {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error('로그인이 필요합니다.');

  const regions = await fetchMyRegions();

  if (regions.length >= 3) {
    throw new Error('동네는 최대 3개까지 등록할 수 있습니다.');
  }

  const duplicated = regions.find(
    (r: any) => r.region_name === region.full_name
  );

  if (duplicated) {
    await saveMyRegionSettings(duplicated.id, 5);
    return duplicated;
  }

  const { data, error } = await supabase
    .from('user_regions')
    .insert({
      user_id: authData.user.id,
      region_name: region.full_name,
      latitude: region.latitude,
      longitude: region.longitude,
      verified: false,
    })
    .select()
    .single();

  if (error) throw error;

  await saveMyRegionSettings(data.id, 5);

  return data;
}

export async function deleteMyRegion(regionId: number) {
  const { error } = await supabase
    .from('user_regions')
    .delete()
    .eq('id', regionId);

  if (error) throw error;
}

export function getDistanceKm(
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return null;
  }

  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}