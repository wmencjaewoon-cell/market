import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../hooks/use-app-theme';
import { supabase } from '../lib/supabase';

type NearbyPlace = {
  id?: string;
  name: string;
  distance_m: number | null;
  category: string;
  address: string;
  phone: string | null;
  intro?: string | null;
  place_url?: string | null;
  verified?: boolean;
  accepts_inquiries?: boolean;
  latitude: number;
  longitude: number;
  features: string[];
  kind: 'supplies' | 'service';
  internal: boolean;
};

export default function NearbyAsPlaces({ analysisId, homeId }: { analysisId: string; homeId: string | null | undefined }) {
  const theme = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    root: { gap: 20, paddingTop: 8 },
    section: { gap: 10 },
    heading: { color: theme.text, fontSize: 18, lineHeight: 27, fontWeight: '800' },
    help: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    card: { padding: 15, gap: 7, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
    top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    name: { flex: 1, color: theme.text, fontSize: 16, fontWeight: '800', lineHeight: 23 },
    distance: { color: theme.primary, fontSize: 13, fontWeight: '800' },
    text: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    features: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    feature: { color: theme.text, backgroundColor: theme.surfaceMuted, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, fontSize: 11, overflow: 'hidden' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    button: { minHeight: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 5 },
    buttonText: { color: theme.text, fontWeight: '700', fontSize: 13 },
    error: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
  }), [theme]);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [busy, setBusy] = useState(Boolean(homeId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!homeId) { setBusy(false); setPlaces([]); return; }
    let active = true;
    setBusy(true); setError('');
    void supabase.functions.invoke('nearby-as-places', { body: { analysis_id: analysisId, home_id: homeId } })
      .then(({ data, error: invokeError }) => {
        if (!active) return;
        if (invokeError || data?.error) {
          setError(data?.code === 'HOME_LOCATION_MISSING' ? '집 위치를 등록하면 주변 철물점과 수리업체를 찾을 수 있어요.' : '주변 업체를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
          return;
        }
        const internal = (data?.internal ?? []).map((item: NearbyPlace) => ({ ...item, internal: true }));
        const external = (data?.external ?? []).map((item: NearbyPlace) => ({ ...item, internal: false }));
        setPlaces([...internal, ...external].sort((a, b) => (a.distance_m ?? Number.MAX_SAFE_INTEGER) - (b.distance_m ?? Number.MAX_SAFE_INTEGER)));
        if (data?.warning) setError(data.warning);
      })
      .catch(() => { if (active) setError('주변 업체를 불러오지 못했습니다.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [analysisId, homeId]);

  if (!homeId) return <Text style={styles.help}>집을 선택해 분석하면 가까운 철물점과 수리업체를 안내해 드려요.</Text>;
  if (busy) return <View style={styles.root}><ActivityIndicator color={theme.primary} /><Text style={styles.help}>집 주변의 실제 업체를 찾고 있어요...</Text></View>;

  const openDirections = (place: NearbyPlace) => Linking.openURL(`https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${place.latitude},${place.longitude}`);
  const renderPlace = (place: NearbyPlace, index: number) => <View key={`${place.internal ? 'i' : 'e'}-${place.id || place.name}-${index}`} style={styles.card}>
    <View style={styles.top}><Text style={styles.name}>{place.name}</Text>{place.distance_m != null ? <Text style={styles.distance}>{place.distance_m < 1000 ? `${place.distance_m}m` : `${(place.distance_m / 1000).toFixed(1)}km`}</Text> : null}</View>
    <Text style={styles.text}>{place.category}</Text>
    {place.address ? <Text style={styles.text}>{place.address}</Text> : null}
    {place.intro ? <Text style={styles.text} numberOfLines={2}>{place.intro}</Text> : null}
    <View style={styles.features}>{place.features.filter(Boolean).map(feature => <Text key={feature} style={styles.feature}>{feature}</Text>)}</View>
    <View style={styles.actions}>
      <TouchableOpacity style={styles.button} onPress={() => void openDirections(place)}><Ionicons name="navigate-outline" size={17} color={theme.text} /><Text style={styles.buttonText}>길찾기</Text></TouchableOpacity>
      {place.phone ? <TouchableOpacity style={styles.button} onPress={() => void Linking.openURL(`tel:${place.phone!.replace(/[^0-9+]/g, '')}`)}><Ionicons name="call-outline" size={17} color={theme.text} /><Text style={styles.buttonText}>전화</Text></TouchableOpacity> : null}
      {place.internal && place.id ? <TouchableOpacity style={styles.button} onPress={() => router.push(`/store/${place.id}` as any)}><Ionicons name="chatbubble-outline" size={17} color={theme.text} /><Text style={styles.buttonText}>앱 문의</Text></TouchableOpacity> : place.place_url ? <TouchableOpacity style={styles.button} onPress={() => void Linking.openURL(place.place_url!)}><Text style={styles.buttonText}>상세보기</Text></TouchableOpacity> : null}
    </View>
  </View>;
  const supplies = places.filter(place => place.kind === 'supplies');
  const services = places.filter(place => place.kind === 'service');

  return <View style={styles.root}>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <View style={styles.section}><Text style={styles.heading}>필요한 물품을 살 수 있는 곳</Text>{supplies.length ? supplies.map(renderPlace) : <Text style={styles.help}>가까운 판매점을 찾지 못했습니다.</Text>}</View>
    <View style={styles.section}><Text style={styles.heading}>전문가가 필요하다면</Text>{services.length ? services.map(renderPlace) : <Text style={styles.help}>가까운 수리업체를 찾지 못했습니다.</Text>}</View>
    <Text style={styles.help}>업체 정보는 앱의 실제 가게 데이터와 Kakao 지역검색 결과이며, AI가 가게 이름이나 영업 정보를 생성하지 않습니다.</Text>
  </View>;
}
