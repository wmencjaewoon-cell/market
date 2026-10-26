import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

type SearchKind = 'supplies' | 'service';
type SearchPlan = { kind: SearchKind; query: string };

function searchPlan(result: Record<string, unknown>): SearchPlan[] {
  const text = [result.issue_area, result.problem_summary, result.recommended_action, ...(Array.isArray(result.tools) ? result.tools : []), ...(Array.isArray(result.parts) ? result.parts : [])]
    .filter(value => typeof value === 'string').join(' ').toLowerCase();
  if (/수전|수도|수도꼭지|누수|배관/.test(text)) return [
    { kind: 'supplies', query: '철물점' }, { kind: 'service', query: '수도설비' }, { kind: 'service', query: '배관수리' },
  ];
  if (/문|경첩|손잡이|도어|열쇠/.test(text)) return [
    { kind: 'supplies', query: '철물점' }, { kind: 'service', query: '열쇠 문수리' }, { kind: 'service', query: '인테리어 보수' },
  ];
  if (/전등|조명|스위치|콘센트|전기/.test(text)) return [
    { kind: 'supplies', query: '조명가게' }, { kind: 'service', query: '전기공사업체' },
  ];
  if (/배수|하수구|싱크대|막힘/.test(text)) return [
    { kind: 'supplies', query: '철물점' }, { kind: 'service', query: '하수구 설비' }, { kind: 'service', query: '배관수리' },
  ];
  return [{ kind: 'supplies', query: '철물점' }, { kind: 'service', query: '인테리어 보수' }];
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: '서버 설정이 필요합니다.' }, 503);
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, 401);
  const viewer = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: authError } = await viewer.auth.getUser();
  if (authError || !user) return json({ error: '로그인 상태를 확인해 주세요.' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: '잘못된 요청입니다.' }, 400); }
  const analysisId = typeof body.analysis_id === 'string' ? body.analysis_id : '';
  const homeId = typeof body.home_id === 'string' ? body.home_id : '';
  if (!uuid.test(analysisId) || !uuid.test(homeId)) return json({ error: '분석 또는 집 번호가 올바르지 않습니다.' }, 400);

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const [{ data: analysis, error: analysisError }, { data: home, error: homeError }] = await Promise.all([
    db.from('as_ai_analyses').select('id,status,result,input_payload').eq('id', analysisId).eq('user_id', user.id).maybeSingle(),
    db.from('user_homes').select('id,latitude,longitude').eq('id', homeId).eq('user_id', user.id).maybeSingle(),
  ]);
  if (analysisError || !analysis || analysis.status !== 'completed' || !analysis.result) return json({ error: '완료된 본인 분석을 찾을 수 없습니다.' }, 404);
  if (homeError || !home || analysis.input_payload?.home_id !== homeId) return json({ error: '분석에 사용한 집을 확인할 수 없습니다.' }, 403);
  const homeLat = Number(home.latitude); const homeLng = Number(home.longitude);
  if (!Number.isFinite(homeLat) || !Number.isFinite(homeLng)) return json({ error: '집 위치가 없어 주변 업체를 검색할 수 없습니다.', code: 'HOME_LOCATION_MISSING' }, 422);

  const plan = searchPlan(analysis.result as Record<string, unknown>);
  const searchText = plan.map(item => item.query).join(' ').toLowerCase();
  const { data: stores, error: storesError } = await db.from('profiles').select(
    'id,display_name,store_category,store_intro,store_address,store_detail_address,phone,is_phone_public,business_verified,store_accepts_inquiries,store_latitude,store_longitude',
  ).eq('user_type', 'store').eq('business_verified', true).neq('store_accepts_inquiries', false)
    .not('store_latitude', 'is', null).not('store_longitude', 'is', null).limit(300);
  if (storesError) return json({ error: '앱 내 업체를 검색하지 못했습니다.' }, 500);

  const internal = (stores ?? []).flatMap((store: Record<string, unknown>) => {
    const lat = Number(store.store_latitude); const lng = Number(store.store_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const distance = distanceMeters(homeLat, homeLng, lat, lng);
    if (distance > 30000) return [];
    const category = typeof store.store_category === 'string' ? store.store_category : '';
    const actualText = [store.display_name, category, store.store_intro].filter(Boolean).join(' ').toLowerCase();
    const relevant = plan.some(item => actualText.includes(item.query.replace(/가게|업체|수리/g, '').trim()))
      || /인테리어|부분수리|자재|전기|조명|욕실|주방/.test(actualText)
      || searchText.includes(category.toLowerCase());
    if (!relevant) return [];
    const kind: SearchKind = /자재|철물|조명가게/.test(actualText) ? 'supplies' : 'service';
    const features = ['앱 인증 업체'];
    if (store.store_accepts_inquiries === true) features.push('A/S 문의 가능');
    if (category) features.push(`${category} 전문`);
    features.push(`우리집에서 ${distance < 1000 ? `${distance}m` : `${(distance / 1000).toFixed(1)}km`}`);
    return [{
      id: store.id, name: store.display_name || '업체', distance_m: distance, category: category || '업종 미등록',
      address: [store.store_address, store.store_detail_address].filter(Boolean).join(' '), phone: store.is_phone_public === true ? store.phone || null : null,
      intro: store.store_intro || null, verified: true, accepts_inquiries: store.store_accepts_inquiries === true,
      latitude: lat, longitude: lng, features, kind,
    }];
  }).sort((a, b) => a.distance_m - b.distance_m).slice(0, 10);

  const restKey = Deno.env.get('KAKAO_REST_API_KEY');
  if (!restKey) return json({ internal, external: [], warning: '외부 지역검색 설정이 없어 앱 인증 업체만 표시합니다.' });
  const responses = await Promise.all(plan.map(async item => {
    const endpoint = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(item.query)}&x=${homeLng}&y=${homeLat}&radius=20000&sort=distance&size=10`;
    const response = await fetch(endpoint, { headers: { Authorization: `KakaoAK ${restKey}` } });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.documents ?? []).map((place: Record<string, unknown>) => ({ place, kind: item.kind }));
  }));
  const seen = new Set<string>();
  const external = responses.flat().flatMap(({ place, kind }: { place: Record<string, unknown>; kind: SearchKind }) => {
    const key = String(place.id || `${place.x}:${place.y}`);
    if (seen.has(key)) return [];
    seen.add(key);
    const distance = Number(place.distance);
    return [{
      name: place.place_name, distance_m: Number.isFinite(distance) ? distance : null,
      category: place.category_name || '지역 업체', address: place.road_address_name || place.address_name || '',
      phone: place.phone || null, place_url: place.place_url || null,
      latitude: Number(place.y), longitude: Number(place.x), kind,
      features: [place.category_name, Number.isFinite(distance) ? `우리집에서 ${distance < 1000 ? `${distance}m` : `${(distance / 1000).toFixed(1)}km`}` : null].filter(Boolean),
    }];
  }).sort((a, b) => (a.distance_m ?? Number.MAX_SAFE_INTEGER) - (b.distance_m ?? Number.MAX_SAFE_INTEGER)).slice(0, 20);
  return json({ internal, external });
});
