import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function MyPurchasesScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchPurchases();
  }, [user]);

  const fetchPurchases = async () => {
    if (!user) return;

    const { data: saleRows, error: saleError } = await supabase
      .from('listing_sales')
      .select(`
        id,
        room_id,
        quantity,
        created_at,
        listings (
          id,
          title,
          price_text,
          region,
          status,
          listing_images (
            id,
            image_path,
            sort_order
          )
        )
      `)
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false });

    if (saleError) {
      console.log('구매 판매기록 조회 실패:', saleError);
    }

    const { data, error } = await supabase
      .from('chat_room_members')
      .select(`
        room_id,
        chat_rooms (
          id,
          listing_id,
          listings (
            id,
            title,
            price_text,
            region,
            status,
            author_id,
            buyer_id,
            reserved_buyer_id,
            listing_images (
              id,
              image_path,
              sort_order
            )
          )
        )
      `)
      .eq('user_id', user.id);

    if (error) {
      console.log('구매내역 조회 실패:', error);
      return;
    }

    const mapListingToPurchase = ({
      key,
      roomId,
      listing,
      status,
      quantity,
    }: {
      key: string;
      roomId?: string | null;
      listing: any;
      status: string;
      quantity?: number | null;
    }) => {
      const sortedImages = [...(listing.listing_images || [])].sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      );

      const imagePath = sortedImages[0]?.image_path;
      const imageUrl = imagePath
        ? supabase.storage.from('listing-images').getPublicUrl(imagePath).data.publicUrl
        : null;

      return {
        key,
        roomId,
        listingId: listing.id,
        title: listing.title,
        priceText: listing.price_text,
        region: listing.region,
        status,
        quantity,
        imageUrl,
      };
    };

    const saleMapped =
      saleRows
        ?.map((row: any) => {
          const listing = row.listings;
          if (!listing) return null;

          return mapListingToPurchase({
            key: `sale-${row.id}`,
            roomId: row.room_id,
            listing,
            status: 'done',
            quantity: row.quantity,
          });
        })
        .filter(Boolean) || [];

    const saleListingIds = new Set(saleMapped.map((item: any) => item.listingId));

    const mapped =
      data
        ?.map((row: any) => {
          const room = row.chat_rooms;
          const listing = room?.listings;

          if (!room || !listing) return null;

          const isCompletedPurchase =
            listing.status === 'done' && listing.buyer_id === user.id;

          const isReservedPurchase =
            listing.status === 'reserved' && listing.reserved_buyer_id === user.id;

          if (!isCompletedPurchase && !isReservedPurchase) return null;
          if (isCompletedPurchase && saleListingIds.has(listing.id)) return null;

          return mapListingToPurchase({
            key: `room-${room.id}`,
            roomId: room.id,
            listing,
            status: listing.status,
          });
        })
        .filter(Boolean) || [];

    setItems([...saleMapped, ...mapped]);
  };

  const getStatusText = (status?: string) => {
    if (status === 'reserved') return '예약중';
    if (status === 'done') return '거래완료';
    return '거래중';
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => item.key}
      ListEmptyComponent={<Text style={styles.empty}>구매내역이 없습니다.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => {
            if (item.roomId) {
              router.push(`/chat/${item.roomId}` as any);
              return;
            }

            router.push(`/(tabs)/home/post/${item.listingId}` as any);
          }}
        >
          <View style={styles.thumbWrap}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <Ionicons name="image-outline" size={24} color="#9ca3af" />
              </View>
            )}
          </View>

          <View style={styles.info}>
            <Text style={styles.status}>{getStatusText(item.status)}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.region || ''}
            </Text>
            <Text style={styles.price} numberOfLines={1}>
              {item.priceText || '가격 문의'}
            </Text>
            {item.quantity ? (
              <Text style={styles.quantityText}>구매 수량 {item.quantity}개</Text>
            ) : null}
          </View>

          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16 },
  empty: { textAlign: 'center', marginTop: 40, color: '#6b7280' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  thumbWrap: {
    width: 74,
    height: 74,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  info: { flex: 1 },
  status: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '800',
    color: '#2563eb',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 6,
  },
  title: { fontSize: 16, fontWeight: '800', color: '#111827' },
  meta: { marginTop: 4, color: '#6b7280', fontSize: 13 },
  price: { marginTop: 4, color: '#111827', fontWeight: '800' },
  quantityText: {
    marginTop: 4,
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '800',
  },
});
