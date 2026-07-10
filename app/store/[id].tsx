import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getOrCreateStoreRoom } from '../../lib/chat';
import { getProfileImageUrl } from '../../lib/profileImage';
import { supabase } from '../../lib/supabase';

export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [profile, setProfile] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);

  const loadStore = useCallback(async () => {
    if (!id) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    setProfile(profileData || null);

    const { data: listingData } = await supabase
      .from('listings')
      .select(`
        *,
        listing_images (
          id,
          image_path,
          sort_order
        )
      `)
      .eq('author_id', id)
      .eq('seller_type', 'store')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(30);

    setItems(
      (listingData || []).map((item: any) => ({
        ...item,
        listing_images: [...(item.listing_images || [])].sort(
          (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        ),
      }))
    );
  }, [id]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  const phone = String(profile?.phone || '').replace(/[^0-9+]/g, '');
  const isVerifiedStore = profile?.user_type === 'store' && !!profile?.business_verified;

  const openPhone = async () => {
    if (!phone) return;
    await logInteraction('phone');
    await Linking.openURL(`tel:${phone}`);
  };

  const openDirections = async () => {
    await logInteraction('directions');

    if (profile?.store_latitude != null && profile?.store_longitude != null) {
      router.push({
        pathname: '/trade-map',
        params: {
          lat: String(profile.store_latitude),
          lng: String(profile.store_longitude),
          region: profile.store_address || profile.display_name || '가게 위치',
          title: profile.display_name || '가게 위치',
        },
      } as any);
    }
  };

  const openStoreChat = async () => {
    if (!id) return;

    try {
      await logInteraction('chat');
      const roomId = await getOrCreateStoreRoom(String(id));
      router.push(`/chat/${roomId}` as any);
    } catch (error: any) {
      Alert.alert(
        '채팅 오류',
        error?.message?.includes('store_user_id')
          ? '새 Supabase 마이그레이션을 먼저 적용해 주세요.'
          : error?.message || '채팅방으로 이동하지 못했습니다.'
      );
    }
  };

  const logInteraction = async (interactionType: 'phone' | 'directions' | 'store_view' | 'chat') => {
    if (!id) return;

    await supabase.from('store_interactions').insert({
      store_user_id: id,
      interaction_type: interactionType,
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: profile?.display_name || '가게 상세' }} />

      <View style={styles.hero}>
        <View style={styles.avatar}>
          {profile?.avatar_path || profile?.avatar_url ? (
            <Image
              source={{ uri: getProfileImageUrl(profile.avatar_path || profile.avatar_url) as string }}
              style={styles.avatarImage}
            />
          ) : (
            <Ionicons name="storefront-outline" size={38} color="#6b7280" />
          )}
        </View>
        <View style={styles.heroText}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile?.display_name || '가게'}</Text>
            {isVerifiedStore ? <Text style={styles.verifiedBadge}>인증</Text> : null}
          </View>
          <Text style={styles.meta}>{profile?.store_address || '등록된 주소 없음'}</Text>
          <Text style={styles.meta}>{profile?.store_business_hours || '영업시간 미등록'}</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <StoreAction icon="call-outline" label="전화하기" disabled={!phone} onPress={openPhone} />
        <StoreAction
          icon="navigate-outline"
          label="길찾기"
          disabled={profile?.store_latitude == null || profile?.store_longitude == null}
          onPress={openDirections}
        />
        <StoreAction
          icon="chatbubble-ellipses-outline"
          label="채팅하기"
          disabled={!isVerifiedStore || profile?.store_accepts_inquiries === false}
          onPress={openStoreChat}
        />
      </View>

      <View style={styles.badgeRow}>
        {profile?.store_card_available ? <Text style={styles.badge}>카드</Text> : null}
        {profile?.store_cash_receipt_available ? <Text style={styles.badge}>현금영수증</Text> : null}
        {profile?.store_tax_invoice_available ? <Text style={styles.badge}>세금계산서</Text> : null}
        {profile?.store_today_available ? <Text style={styles.badge}>오늘 가능</Text> : null}
      </View>

      {profile?.store_notice ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>가게 공지</Text>
          <Text style={styles.bodyText}>{profile.store_notice}</Text>
        </View>
      ) : null}

      {profile?.store_intro ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>가게 소개</Text>
          <Text style={styles.bodyText}>{profile.store_intro}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>이 가게 상품</Text>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>등록된 판매중 상품이 없습니다.</Text>
        ) : (
          items.map((item) => {
            const imagePath = item.listing_images?.[0]?.image_path;
            const imageUrl = imagePath
              ? supabase.storage.from('listing-images').getPublicUrl(imagePath).data.publicUrl
              : null;

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.productRow}
                onPress={() => router.push(`/(tabs)/home/post/${item.id}` as any)}
              >
                <View style={styles.productImageBox}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.productImage} />
                  ) : (
                    <Ionicons name="image-outline" size={24} color="#9ca3af" />
                  )}
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.productPrice}>{item.price_text || '가격 문의'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function StoreAction({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, disabled && styles.actionBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={18} color={disabled ? '#9ca3af' : '#111827'} />
      <Text style={[styles.actionText, disabled && styles.actionTextDisabled]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  hero: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  heroText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: '#111827', fontSize: 22, fontWeight: '900' },
  verifiedBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 999,
    color: '#1d4ed8',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: '900',
  },
  meta: { marginTop: 4, color: '#6b7280', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionBtnDisabled: { backgroundColor: '#f9fafb' },
  actionText: { color: '#111827', fontSize: 12, fontWeight: '900' },
  actionTextDisabled: { color: '#9ca3af' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    color: '#047857',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '900',
  },
  section: { gap: 8 },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '900' },
  bodyText: { color: '#374151', fontSize: 14, lineHeight: 22, fontWeight: '600' },
  emptyText: { color: '#6b7280', fontSize: 14, fontWeight: '700' },
  productRow: {
    minHeight: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eef2f7',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  productImageBox: {
    width: 62,
    height: 62,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productImage: { width: '100%', height: '100%' },
  productInfo: { flex: 1 },
  productTitle: { color: '#111827', fontSize: 15, fontWeight: '900', lineHeight: 20 },
  productPrice: { marginTop: 4, color: '#2563eb', fontSize: 14, fontWeight: '900' },
});
