import { supabase } from './supabase';

export type UserHome = {
  id: string;
  user_id: string;
  name: string;
  road_address: string | null;
  jibun_address: string | null;
  detail_address: string | null;
  zonecode: string | null;
  bcode: string | null;
  building_name: string | null;
  building_type: string | null;
  area_sqm: number | null;
  area_pyeong: number | null;
  building_year: number | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type UserHomeInput = Pick<UserHome, 'name'> & Partial<Pick<UserHome,
  'road_address' | 'jibun_address' | 'detail_address' | 'zonecode' | 'bcode' |
  'building_name' | 'building_type' | 'area_sqm' | 'area_pyeong' | 'building_year' |
  'latitude' | 'longitude' | 'is_default'
>>;

const HOME_FIELDS = 'id,user_id,name,road_address,jibun_address,detail_address,zonecode,bcode,building_name,building_type,area_sqm,area_pyeong,building_year,latitude,longitude,is_default,created_at,updated_at';

export async function fetchUserHomes(): Promise<UserHome[]> {
  const { data, error } = await supabase
    .from('user_homes')
    .select(HOME_FIELDS)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as UserHome[];
}

export async function fetchUserHome(id: string): Promise<UserHome | null> {
  const { data, error } = await supabase
    .from('user_homes')
    .select(HOME_FIELDS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as UserHome | null;
}

export async function saveUserHome(userId: string, input: UserHomeInput, id?: string) {
  const payload = {
    ...input,
    name: input.name.trim(),
    road_address: input.road_address?.trim() || null,
    jibun_address: input.jibun_address?.trim() || null,
    detail_address: input.detail_address?.trim() || null,
    zonecode: input.zonecode?.trim() || null,
    bcode: input.bcode?.trim() || null,
    building_name: input.building_name?.trim() || null,
    building_type: input.building_type?.trim() || null,
  };

  const query = id
    ? supabase.from('user_homes').update(payload).eq('id', id)
    : supabase.from('user_homes').insert({ ...payload, user_id: userId });
  const { data, error } = await query.select(HOME_FIELDS).single();
  if (error) throw error;
  return data as UserHome;
}

export async function setDefaultUserHome(id: string) {
  const { data, error } = await supabase.rpc('set_default_user_home', { p_home_id: id });
  if (error) throw error;
  return data as UserHome;
}

export async function deleteUserHome(id: string) {
  const { error } = await supabase.from('user_homes').delete().eq('id', id);
  if (error) throw error;
}

export function formatHomeAddress(home: Pick<UserHome, 'road_address' | 'jibun_address' | 'detail_address'>) {
  return [home.road_address || home.jibun_address, home.detail_address].filter(Boolean).join(' ');
}

export function formatHomeSummary(home: Pick<UserHome, 'building_type' | 'area_pyeong' | 'building_year'>) {
  return [
    home.building_type,
    home.area_pyeong != null ? `${Number(home.area_pyeong).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}평` : null,
    home.building_year != null ? `${home.building_year}년 준공` : null,
  ].filter(Boolean).join(' · ');
}
