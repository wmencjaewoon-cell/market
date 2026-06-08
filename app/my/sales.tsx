import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCard from '../../components/MaterialCard';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function MySalesScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchMyListings();
  }, [user]);

  const fetchMyListings = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        profiles!listings_author_id_fkey (
          id,
          display_name,
          user_type,
          phone,
          is_phone_public
        ),
        listing_images (
          id,
          image_path,
          sort_order
        )
      `)
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('판매관리 조회 실패:', error);
      return;
    }

    const listingIds = (data || []).map((item) => item.id);

    if (listingIds.length === 0) {
      setItems([]);
      return;
    }

    const { data: favorites } = await supabase
      .from('favorites')
      .select('listing_id')
      .in('listing_id', listingIds);

    const { data: chats } = await supabase
      .from('chat_rooms')
      .select('listing_id')
      .in('listing_id', listingIds);

    const favoriteMap = new Map<number, number>();
    const chatMap = new Map<number, number>();

    (favorites || []).forEach((row: any) => {
      favoriteMap.set(row.listing_id, (favoriteMap.get(row.listing_id) || 0) + 1);
    });

    (chats || []).forEach((row: any) => {
      chatMap.set(row.listing_id, (chatMap.get(row.listing_id) || 0) + 1);
    });

    const mapped = (data || []).map((item: any) => ({
      ...item,
      favorites_count: favoriteMap.get(item.id) || item.favorites_count || 0,
      chats_count: chatMap.get(item.id) || item.chats_count || 0,
      listing_images: [...(item.listing_images || [])].sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
    }));

    setItems(mapped);
  };

  const handleDelete = async (id: number) => {
    const ok =
      Platform.OS === 'web'
        ? window.confirm('이 게시글을 삭제할까요?')
        : true;

    if (Platform.OS !== 'web') {
      Alert.alert('삭제하기', '이 게시글을 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => deleteListing(id),
        },
      ]);
      return;
    }

    if (ok) {
      await deleteListing(id);
    }
  };

  const deleteListing = async (id: number) => {
    try {
      const { error } = await supabase
        .from('listings')
        .delete()
        .eq('id', id)
        .eq('author_id', user?.id);

      if (error) {
        Alert.alert('삭제 실패', error.message);
        return;
      }

      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (e: any) {
      console.log('삭제 실패:', e);
      Alert.alert('삭제 실패', e?.message || '게시글을 삭제하지 못했습니다.');
    }
  };

  const statusLabel = (status?: string) => {
    if (status === 'active') return '판매중';
    if (status === 'reserved') return '예약중';
    if (status === 'done') return '거래완료';
    return '숨김';
  };

  const getQuantityInfo = (item: any) => {
    const total = Math.max(1, Number(item.quantity_total ?? 1));
    const fallbackRemaining = item.status === 'done' ? 0 : total;
    const remaining = Math.max(0, Number(item.quantity_remaining ?? fallbackRemaining));
    const sold = Math.max(0, Number(item.quantity_sold ?? Math.max(0, total - remaining)));

    return { total, remaining, sold, isMultiQuantity: total > 1 };
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';

    const d = new Date(dateString);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
      d.getDate()
    ).padStart(2, '0')}`;
  };

  const renderSaleItem = ({ item }: { item: any }) => {
    const quantityInfo = getQuantityInfo(item);

    return (
      <View style={styles.itemWrap}>
        <MaterialCard item={item} onRefresh={fetchMyListings} showMenu={false} />

        <View style={styles.manageBox}>
          <View style={styles.manageTopRow}>
            <View style={styles.statusRow}>
              <Text style={styles.status}>{statusLabel(item.status)}</Text>
              <Text style={styles.date}>{formatDate(item.created_at)}</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={() => router.push(`/(tabs)/home/post/edit/${item.id}` as any)}
              >
                <Text style={styles.smallBtnText}>수정</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, styles.deleteBtn]}
                onPress={() => handleDelete(item.id)}
              >
                <Text style={[styles.smallBtnText, styles.deleteBtnText]}>삭제</Text>
              </TouchableOpacity>
            </View>
          </View>

          {quantityInfo.isMultiQuantity ? (
            <Text style={styles.stockText}>
              재고 {quantityInfo.remaining}/{quantityInfo.total}개
              {quantityInfo.sold > 0 ? ` · 판매 ${quantityInfo.sold}개` : ''}
            </Text>
          ) : null}

          <Text style={styles.statsText}>
            조회 {item.views_count ?? 0} · 채팅 {item.chats_count ?? 0} · 관심{' '}
            {item.favorites_count ?? 0}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Text style={styles.empty}>등록한 글이 없습니다.</Text>}
      renderItem={renderSaleItem}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12 },
  empty: { textAlign: 'center', marginTop: 40, color: '#6b7280' },

  itemWrap: {
    gap: 8,
  },

  manageBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 12,
  },

  manageTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  statusRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  status: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '800',
    color: '#2563eb',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },

  date: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '700',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },

  smallBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  smallBtnText: { color: '#fff', fontWeight: '800' },

  deleteBtn: { backgroundColor: '#fee2e2' },
  deleteBtnText: { color: '#dc2626' },

  stockText: {
    marginTop: 10,
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '800',
  },

  statsText: {
    marginTop: 7,
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '700',
  },
});
