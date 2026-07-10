import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getProfileImageUrl } from '../../lib/profileImage';
import { supabase } from '../../lib/supabase';

export default function StoreListScreen() {
  const [stores, setStores] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadStores = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        display_name,
        avatar_path,
        avatar_url,
        phone,
        store_address,
        store_intro,
        store_notice,
        store_business_hours,
        store_today_available,
        store_card_available,
        store_cash_receipt_available,
        store_tax_invoice_available,
        store_accepts_inquiries,
        business_verified,
        user_type
      `)
      .eq('user_type', 'store')
      .eq('business_verified', true)
      .order('display_name', { ascending: true });

    if (error) {
      console.log('가게 목록 조회 실패:', error);
      setStores([]);
      return;
    }

    setStores(data || []);
  };

  useEffect(() => {
    void loadStores();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStores();
    setRefreshing(false);
  };

  const filteredStores = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return stores;

    return stores.filter((store) => {
      const searchableText = [
        store.display_name,
        store.store_address,
        store.store_intro,
        store.store_notice,
        store.store_business_hours,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }, [search, stores]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <Stack.Screen options={{ title: '가게 목록' }} />

      <Text style={styles.title}>가게 목록</Text>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={19} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="가게명, 주소, 취급 내용을 검색해보세요"
          placeholderTextColor="#9ca3af"
        />
      </View>

      {filteredStores.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="storefront-outline" size={36} color="#d1d5db" />
          <Text style={styles.emptyTitle}>표시할 가게가 없습니다</Text>
        </View>
      ) : (
        filteredStores.map((store) => {
          const avatarUrl =
            store.avatar_path || store.avatar_url
              ? getProfileImageUrl(store.avatar_path || store.avatar_url)
              : null;

          return (
            <TouchableOpacity
              key={store.id}
              style={styles.card}
              onPress={() => router.push(`/store/${store.id}` as any)}
            >
              <View style={styles.avatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="storefront-outline" size={28} color="#6b7280" />
                )}
              </View>

              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {store.display_name || '인증 가게'}
                  </Text>
                  <Text style={styles.verifiedBadge}>인증</Text>
                </View>

                <Text style={styles.meta} numberOfLines={1}>
                  {store.store_address || '주소 미등록'}
                </Text>

                {store.store_intro ? (
                  <Text style={styles.intro} numberOfLines={2}>
                    {store.store_intro}
                  </Text>
                ) : null}

                <View style={styles.badgeRow}>
                  {store.store_today_available ? <Text style={styles.badge}>오늘 가능</Text> : null}
                  {store.store_card_available ? <Text style={styles.badge}>카드</Text> : null}
                  {store.store_cash_receipt_available ? <Text style={styles.badge}>현금영수증</Text> : null}
                  {store.store_tax_invoice_available ? <Text style={styles.badge}>세금계산서</Text> : null}
                  {store.store_accepts_inquiries !== false ? <Text style={styles.badge}>문의 가능</Text> : null}
                </View>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  title: { color: '#111827', fontSize: 24, fontWeight: '900' },
  searchBox: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: '#111827', fontSize: 15, paddingVertical: 0 },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  info: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, color: '#111827', fontSize: 16, fontWeight: '900' },
  verifiedBadge: {
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '900',
  },
  meta: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '700' },
  intro: { marginTop: 6, color: '#374151', fontSize: 13, lineHeight: 18 },
  badgeRow: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: {
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    color: '#047857',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
  },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 70 },
  emptyTitle: { color: '#6b7280', fontSize: 15, fontWeight: '900' },
});
