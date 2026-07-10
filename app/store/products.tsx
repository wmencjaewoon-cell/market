import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type ProductFilter = 'all' | 'active' | 'reserved' | 'done' | 'hidden';

const FILTERS: { key: ProductFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '판매중' },
  { key: 'reserved', label: '예약중' },
  { key: 'done', label: '판매완료' },
  { key: 'hidden', label: '숨김' },
];

function getStatusLabel(status?: string) {
  if (status === 'reserved') return '예약중';
  if (status === 'done') return '판매완료';
  if (status === 'hidden') return '숨김';
  return '판매중';
}

export default function StoreProductsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<ProductFilter>('all');
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        listing_images (
          id,
          image_path,
          sort_order
        )
      `)
      .eq('author_id', user.id)
      .eq('seller_type', 'store')
      .order('created_at', { ascending: false });

    if (error) {
      console.log('가게 상품 조회 실패:', error);
      setItems([]);
      setLoading(false);
      return;
    }

    setItems(
      (data || []).map((item: any) => ({
        ...item,
        listing_images: [...(item.listing_images || [])].sort(
          (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        ),
      }))
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.status === filter);
  }, [filter, items]);

  const updateStatus = async (item: any, status: 'active' | 'reserved' | 'done') => {
    if (!user) return;

    const quantityTotal = Math.max(1, Number(item.quantity_total ?? 1));
    const nextValues = {
      status,
      quantity_remaining: status === 'done' ? 0 : Math.max(1, Number(item.quantity_remaining ?? quantityTotal)),
      quantity_sold: status === 'done' ? quantityTotal : Number(item.quantity_sold ?? 0),
      listing_hidden_previous_status: null,
    };

    const { error } = await supabase
      .from('listings')
      .update(nextValues)
      .eq('id', item.id)
      .eq('author_id', user.id);

    if (error) {
      Alert.alert('상태 변경 실패', error.message);
      return;
    }

    setItems((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, ...nextValues } : row))
    );
  };

  const toggleHidden = async (item: any) => {
    if (!user) return;

    const isHidden = item.status === 'hidden';
    const restoreStatus =
      item.listing_hidden_previous_status &&
      ['active', 'reserved', 'done'].includes(item.listing_hidden_previous_status)
        ? item.listing_hidden_previous_status
        : 'active';

    const nextValues = isHidden
      ? { status: restoreStatus, listing_hidden_previous_status: null }
      : {
          status: 'hidden',
          listing_hidden_previous_status:
            item.status && item.status !== 'hidden' ? item.status : 'active',
        };

    const { error } = await supabase
      .from('listings')
      .update(nextValues)
      .eq('id', item.id)
      .eq('author_id', user.id);

    if (error) {
      Alert.alert('숨김 처리 실패', error.message);
      return;
    }

    setItems((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, ...nextValues } : row))
    );
  };

  const duplicateProduct = async (item: any) => {
    if (!user) return;

    const ok =
      Platform.OS === 'web'
        ? window.confirm('이 상품 정보를 복사해서 새 상품으로 등록할까요? 사진은 복사되지 않습니다.')
        : true;

    if (!ok) return;

    if (Platform.OS !== 'web') {
      Alert.alert('복사 등록', '사진을 제외한 상품 정보를 복사해서 등록할까요?', [
        { text: '취소', style: 'cancel' },
        { text: '등록', onPress: () => void runDuplicateProduct(item) },
      ]);
      return;
    }

    await runDuplicateProduct(item);
  };

  const runDuplicateProduct = async (item: any) => {
    if (!user) return;

    const {
      id: _id,
      created_at: _createdAt,
      updated_at: _updatedAt,
      listing_images: _images,
      ...copy
    } = item;

    const { data, error } = await supabase
      .from('listings')
      .insert({
        ...copy,
        author_id: user.id,
        store_user_id: user.id,
        seller_type: 'store',
        status: 'active',
        title: `${item.title} 복사본`,
        views_count: 0,
        favorites_count: 0,
        chats_count: 0,
        listing_hidden_previous_status: null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      Alert.alert('복사 등록 실패', error.message);
      return;
    }

    setItems((prev) => [data, ...prev]);
  };

  const renderItem = ({ item }: { item: any }) => {
    const imagePath = item.listing_images?.[0]?.image_path;
    const imageUrl = imagePath
      ? supabase.storage.from('listing-images').getPublicUrl(imagePath).data.publicUrl
      : null;

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardTop}
          onPress={() => router.push(`/(tabs)/home/post/${item.id}` as any)}
        >
          <View style={styles.imageBox}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.image} />
            ) : (
              <Ionicons name="image-outline" size={26} color="#9ca3af" />
            )}
          </View>

          <View style={styles.cardInfo}>
            <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.priceText}>{item.price_text || '가격 문의'}</Text>
            <Text style={styles.metaText}>
              수량 {item.quantity_remaining ?? item.quantity_total ?? 1}/{item.quantity_total ?? 1}
              {item.quantity_unit || '개'}
            </Text>
            <Text style={[styles.statusBadge, item.status === 'hidden' && styles.hiddenBadge]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.quickRow}>
          <QuickButton label="수정" onPress={() => router.push(`/(tabs)/home/post/edit/${item.id}` as any)} />
          <QuickButton label="예약중" onPress={() => updateStatus(item, 'reserved')} />
          <QuickButton label="판매완료" onPress={() => updateStatus(item, 'done')} />
          <QuickButton label={item.status === 'hidden' ? '숨김취소' : '숨김'} onPress={() => toggleHidden(item)} />
          <QuickButton label="복사 등록" onPress={() => duplicateProduct(item)} />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '상품 관리' }} />

      <View style={styles.header}>
        <Text style={styles.title}>상품 관리</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/store/product-create' as any)}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addText}>상품 등록하기</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((option) => {
          const active = filter === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
              onPress={() => setFilter(option.key)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>상품이 없습니다.</Text>}
        />
      )}
    </View>
  );
}

function QuickButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickBtn} onPress={onPress}>
      <Text style={styles.quickText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  header: { padding: 16, gap: 12 },
  title: { color: '#111827', fontSize: 24, fontWeight: '900' },
  addBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  filterBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  filterBtnActive: { borderColor: '#111827', backgroundColor: '#111827' },
  filterText: { color: '#374151', fontSize: 13, fontWeight: '800' },
  filterTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingTop: 6, gap: 12, paddingBottom: 60 },
  emptyText: { color: '#6b7280', fontSize: 14, fontWeight: '700', textAlign: 'center', paddingTop: 40 },
  card: {
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef2f7',
    padding: 12,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  imageBox: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  cardInfo: { flex: 1, gap: 4 },
  productTitle: { color: '#111827', fontSize: 16, fontWeight: '900', lineHeight: 22 },
  priceText: { color: '#2563eb', fontSize: 15, fontWeight: '900' },
  metaText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    color: '#047857',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '900',
  },
  hiddenBadge: { backgroundColor: '#f3f4f6', color: '#6b7280' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  quickText: { color: '#111827', fontSize: 12, fontWeight: '900' },
});
