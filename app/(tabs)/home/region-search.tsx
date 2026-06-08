import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    addMyRegionBySearch,
    getNearbyRegionCandidatesByGps,
    searchRegionMaster,
} from '../../../lib/region';

export default function RegionSearchScreen() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  const [nearbyRegions, setNearbyRegions] = useState<any[]>([]);
  useEffect(() => {
  loadNearbyRegions();
}, []);

const loadNearbyRegions = async () => {
  try {
    const candidates = await getNearbyRegionCandidatesByGps();
    setNearbyRegions(candidates);
  } catch (e) {
    console.log('내 위치 주변 동네 불러오기 실패:', e);
  }
};

  const handleSearch = async (text: string) => {
  setKeyword(text);
  setMessage('');

  if (!text.trim()) {
    setResults([]);
    return;
  }

  try {
    const data = await searchRegionMaster(text);
    setResults(data);
  } catch (e: any) {
    setMessage(e?.message || '동네 검색에 실패했습니다.');
  }
};

  const handleSelect = async (region: any) => {
  try {
    setMessage('');

    await addMyRegionBySearch({
      region_name: region.region_name,
      full_name: region.full_name || region.region_name,
      latitude: region.latitude,
      longitude: region.longitude,
    });

    router.back();
  } catch (e: any) {
    setMessage(e?.message || '동네 추가에 실패했습니다.');
  }
};

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>동네 추가</Text>
        <View style={{ width: 24 }} />
      </View>

      <TextInput
        style={styles.input}
        placeholder="동, 읍, 면으로 검색 예: 기장읍"
        value={keyword}
        onChangeText={handleSearch}
        autoFocus
      />

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <FlatList
  data={keyword.trim() ? results : nearbyRegions}
  keyExtractor={(item, index) => String(item.id ?? `${item.region_name}-${index}`)}
  ListHeaderComponent={
    <Text style={styles.sectionTitle}>
      {keyword.trim() ? '검색 결과' : '내 위치 주변 동네'}
    </Text>
  }
  renderItem={({ item }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => handleSelect(item)}
    >
      <Text style={styles.regionName}>
        {item.full_name || item.region_name}
      </Text>
      <Text style={styles.sub}>이 동네로 설정</Text>
    </TouchableOpacity>
  )}
  ListEmptyComponent={
    keyword.trim() ? (
      <Text style={styles.empty}>검색 결과가 없습니다.</Text>
    ) : (
      <Text style={styles.empty}>내 위치 주변 동네를 불러오지 못했습니다.</Text>
    )
  }
/>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  item: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
  },
  sectionTitle: {
  fontSize: 15,
  fontWeight: '800',
  color: '#111827',
  marginBottom: 10,
},
  regionName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  sub: { marginTop: 4, color: '#6b7280' },
  empty: { textAlign: 'center', marginTop: 40, color: '#6b7280' },
  message: { color: '#dc2626', fontWeight: '700', marginBottom: 10 },
});