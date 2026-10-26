import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../hooks/use-app-theme';
import { supabase } from '../../lib/supabase';
import { fetchUserHome, saveUserHome } from '../../lib/userHomes';
import type { RegionSearchItem } from '../../types';

const BUILDING_TYPES = ['아파트', '빌라/연립', '단독주택', '오피스텔', '상가', '기타'];

export default function HomeEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { padding: 20, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 720, alignSelf: 'center', gap: 18 },
    section: { gap: 9 },
    label: { color: theme.text, fontSize: 15, fontWeight: '700' },
    help: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    input: { minHeight: 50, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, color: theme.text, backgroundColor: theme.surface, fontSize: 16 },
    searchRow: { flexDirection: 'row', gap: 8 },
    flex: { flex: 1 },
    smallButton: { minHeight: 50, paddingHorizontal: 16, borderRadius: 12, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
    smallButtonText: { color: theme.primaryText, fontWeight: '800' },
    result: { padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 3, backgroundColor: theme.surface },
    resultTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
    resultText: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    selectedAddress: { padding: 14, borderRadius: 12, backgroundColor: theme.primarySoft, gap: 4 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 44, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', backgroundColor: theme.surface },
    chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipText: { color: theme.text, fontWeight: '700' },
    chipTextActive: { color: theme.primaryText },
    check: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48 },
    save: { minHeight: 54, borderRadius: 14, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    saveText: { color: theme.primaryText, fontSize: 16, fontWeight: '800' },
    error: { color: theme.danger, lineHeight: 22 },
  }), [insets.bottom, theme]);

  const [name, setName] = useState('우리집');
  const [roadAddress, setRoadAddress] = useState('');
  const [jibunAddress, setJibunAddress] = useState('');
  const [detailAddress, setDetailAddress] = useState('');
  const [zonecode, setZonecode] = useState('');
  const [bcode, setBcode] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [buildingType, setBuildingType] = useState('');
  const [areaPyeong, setAreaPyeong] = useState('');
  const [buildingYear, setBuildingYear] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegionSearchItem[]>([]);
  const [busy, setBusy] = useState(Boolean(id));
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let active = true;
    void fetchUserHome(id).then(home => {
      if (!active || !home) return;
      setName(home.name); setRoadAddress(home.road_address || ''); setJibunAddress(home.jibun_address || '');
      setDetailAddress(home.detail_address || ''); setZonecode(home.zonecode || ''); setBcode(home.bcode || ''); setBuildingName(home.building_name || ''); setBuildingType(home.building_type || '');
      setAreaPyeong(home.area_pyeong == null ? '' : String(home.area_pyeong));
      setBuildingYear(home.building_year == null ? '' : String(home.building_year));
      setLatitude(home.latitude); setLongitude(home.longitude); setIsDefault(home.is_default);
    }).catch(() => { if (active) setError('집 정보를 불러오지 못했습니다.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [id]);

  const searchAddress = async () => {
    if (query.trim().length < 2 || searching) return;
    setSearching(true); setError(''); setResults([]); Keyboard.dismiss();
    const { data, error: invokeError } = await supabase.functions.invoke('search-regions', { body: { query: query.trim() } });
    if (invokeError || data?.error) setError('주소를 검색하지 못했습니다. 도로명이나 건물명을 다시 입력해 주세요.');
    else setResults((data?.items ?? []) as RegionSearchItem[]);
    setSearching(false);
  };

  const selectAddress = (item: RegionSearchItem) => {
    const lat = Number(item.y); const lng = Number(item.x);
    setRoadAddress(item.road_address_name || item.address_name || item.region_name);
    setJibunAddress(item.address_name || '');
    setBuildingName(item.place_name || '');
    setZonecode(item.zonecode || ''); setBcode(item.bcode || '');
    setLatitude(Number.isFinite(lat) ? lat : null); setLongitude(Number.isFinite(lng) ? lng : null);
    setResults([]); setQuery('');
  };

  const save = async () => {
    if (!user || busy) return;
    const pyeong = areaPyeong.trim() ? Number(areaPyeong) : null;
    const year = buildingYear.trim() ? Number(buildingYear) : null;
    if (!name.trim()) { setError('집 이름을 입력해 주세요.'); return; }
    if (!roadAddress && !jibunAddress) { setError('주소를 검색해 선택해 주세요.'); return; }
    if (latitude == null || longitude == null) { setError('주변 업체 검색을 위해 위치가 포함된 주소를 다시 선택해 주세요.'); return; }
    if (pyeong != null && (!Number.isFinite(pyeong) || pyeong <= 0 || pyeong > 10000)) { setError('평수를 올바르게 입력해 주세요.'); return; }
    if (year != null && (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear() + 5)) { setError('준공연도를 올바르게 입력해 주세요.'); return; }
    setBusy(true); setError('');
    try {
      await saveUserHome(user.id, {
        name, road_address: roadAddress, jibun_address: jibunAddress, detail_address: detailAddress,
        zonecode, bcode,
        building_name: buildingName, building_type: buildingType || null,
        area_pyeong: pyeong, area_sqm: pyeong == null ? null : Number((pyeong * 3.305785).toFixed(2)),
        building_year: year, latitude, longitude, is_default: isDefault,
      }, id);
      router.back();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '집 정보를 저장하지 못했습니다.'); setBusy(false);
    }
  };

  if (busy && id && !roadAddress && !error) return <View style={styles.content}><ActivityIndicator color={theme.primary} /></View>;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.section}><Text style={styles.label}>집 이름</Text><TextInput style={styles.input} value={name} onChangeText={setName} maxLength={60} placeholder="예: 우리집, 부모님집" placeholderTextColor={theme.textMuted} /></View>
    <View style={styles.section}>
      <Text style={styles.label}>주소 검색</Text>
      <View style={styles.searchRow}><TextInput style={[styles.input, styles.flex]} value={query} onChangeText={setQuery} onSubmitEditing={() => void searchAddress()} maxLength={120} placeholder="도로명, 지번 또는 건물명" placeholderTextColor={theme.textMuted} returnKeyType="search" /><TouchableOpacity style={styles.smallButton} disabled={searching} onPress={() => void searchAddress()}>{searching ? <ActivityIndicator color={theme.primaryText} /> : <Text style={styles.smallButtonText}>검색</Text>}</TouchableOpacity></View>
      {results.map(item => <TouchableOpacity key={`${item.id}-${item.x}-${item.y}`} style={styles.result} onPress={() => selectAddress(item)}><Text style={styles.resultTitle}>{item.road_address_name || item.address_name || item.region_name}</Text>{item.road_address_name && item.address_name ? <Text style={styles.resultText}>지번 {item.address_name}</Text> : null}{item.place_name ? <Text style={styles.resultText}>{item.place_name}</Text> : null}</TouchableOpacity>)}
      {roadAddress || jibunAddress ? <View style={styles.selectedAddress}><Text style={styles.resultTitle}>{roadAddress || jibunAddress}</Text>{jibunAddress && jibunAddress !== roadAddress ? <Text style={styles.resultText}>지번 {jibunAddress}</Text> : null}</View> : null}
      <Text style={styles.help}>선택한 위치는 주변 철물점·수리업체 검색에만 사용하며 AI 분석 모델로 보내지 않습니다.</Text>
    </View>
    <View style={styles.section}><Text style={styles.label}>상세주소 (선택)</Text><TextInput style={styles.input} value={detailAddress} onChangeText={setDetailAddress} maxLength={300} placeholder="동·호수 등" placeholderTextColor={theme.textMuted} /></View>
    <View style={styles.section}><Text style={styles.label}>건물명 (선택)</Text><TextInput style={styles.input} value={buildingName} onChangeText={setBuildingName} maxLength={200} placeholder="예: 한마음아파트" placeholderTextColor={theme.textMuted} /></View>
    <View style={styles.section}><Text style={styles.label}>건물 종류 (선택)</Text><View style={styles.chips}>{BUILDING_TYPES.map(item => <TouchableOpacity key={item} style={[styles.chip, buildingType === item && styles.chipActive]} onPress={() => setBuildingType(previous => previous === item ? '' : item)}><Text style={[styles.chipText, buildingType === item && styles.chipTextActive]}>{item}</Text></TouchableOpacity>)}</View></View>
    <View style={styles.section}><Text style={styles.label}>평수 (선택)</Text><TextInput style={styles.input} value={areaPyeong} onChangeText={setAreaPyeong} keyboardType="decimal-pad" placeholder="예: 32" placeholderTextColor={theme.textMuted} /></View>
    <View style={styles.section}><Text style={styles.label}>준공연도 (선택)</Text><TextInput style={styles.input} value={buildingYear} onChangeText={setBuildingYear} keyboardType="number-pad" maxLength={4} placeholder="예: 2018" placeholderTextColor={theme.textMuted} /></View>
    <TouchableOpacity style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: isDefault }} onPress={() => setIsDefault(value => !value)}><Ionicons name={isDefault ? 'checkbox' : 'square-outline'} size={24} color={theme.primary} /><Text style={styles.label}>기본 집으로 사용</Text></TouchableOpacity>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <TouchableOpacity style={[styles.save, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => void save()}>{busy ? <ActivityIndicator color={theme.primaryText} /> : <Ionicons name="checkmark-circle-outline" size={22} color={theme.primaryText} />}<Text style={styles.saveText}>저장</Text></TouchableOpacity>
  </ScrollView>;
}
