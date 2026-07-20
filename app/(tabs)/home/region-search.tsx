import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { type AppPalette } from '../../../contexts/theme';
import { useAppTheme } from '../../../hooks/use-app-theme';
import {
  addMyRegionBySearch,
  getNearbyRegionCandidatesByGps,
  searchRegionMaster,
} from '../../../lib/region';

export default function RegionSearchScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      <View style={styles.header} />

      <TextInput
        style={styles.input}
        placeholder="동, 읍, 면으로 검색 예: 기장읍"
        placeholderTextColor={theme.textSubtle}
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
          <TouchableOpacity style={styles.item} onPress={() => handleSelect(item)}>
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

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background, padding: 16 },
    header: {
      marginBottom: 16,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      backgroundColor: theme.input,
      color: theme.text,
    },
    item: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      backgroundColor: theme.surface,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 10,
    },
    regionName: { fontSize: 16, fontWeight: '800', color: theme.text },
    sub: { marginTop: 4, color: theme.textMuted },
    empty: { textAlign: 'center', marginTop: 40, color: theme.textMuted },
    message: { color: theme.danger, fontWeight: '700', marginBottom: 10 },
  });
}
