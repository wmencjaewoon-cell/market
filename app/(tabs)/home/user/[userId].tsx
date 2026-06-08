import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getProfileImageUrl } from '../../../../lib/profileImage';
import { supabase } from '../../../../lib/supabase';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [reviewStats, setReviewStats] = useState({
  average: 0,
  count: 0,
});

  const [profile, setProfile] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!userId) return;
    fetchProfile();
    fetchUserListings();
    fetchReviewStats();
  }, [userId]);

  const fetchProfile = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setProfile(data);
    }
  };

  

  const fetchUserListings = async () => {
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
      .eq('author_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setItems(data);
    }
  };

  const fetchReviewStats = async () => {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('target_user_id', userId);

  if (error) {
    console.log('후기 통계 조회 실패:', error);
    return;
  }

  const ratings = data || [];
  const count = ratings.length;
  const average =
    count > 0
      ? ratings.reduce((sum: number, item: any) => sum + Number(item.rating || 0), 0) / count
      : 0;

  setReviewStats({
    average,
    count,
  });
};

  const profileImageUrl = getProfileImageUrl(profile?.avatar_path || profile?.avatar_url);
  const isVerifiedStore = profile?.user_type === 'store' && !!profile?.business_verified;
  const hasStoreLocation =
    isVerifiedStore &&
    profile?.store_latitude != null &&
    profile?.store_longitude != null;
  const canCallStore =
    isVerifiedStore &&
    !!profile?.is_phone_public &&
    !!profile?.phone;

  const handleCall = async () => {
  if (!canCallStore) return;

  const phone = String(profile.phone).replace(/[^0-9]/g, '');

  try {
    await Linking.openURL(`tel:${phone}`);
  } catch (e) {
    console.log('전화 연결 실패:', e);
  }
};

  const openStoreMap = () => {
    if (!hasStoreLocation) return;

    router.push({
      pathname: '/trade-map',
      params: {
        lat: String(profile.store_latitude),
        lng: String(profile.store_longitude),
        region: profile.store_address || '',
        place: profile.store_address || profile.display_name || '가게 위치',
        title: '가게 위치',
      },
    } as any);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
  <TouchableOpacity onPress={() => router.back()}>
    <Ionicons name="chevron-back" size={24} color="#111827" />
  </TouchableOpacity>

  <Text style={styles.headerTitle}>판매자 정보</Text>

  {canCallStore ? (
    <TouchableOpacity onPress={handleCall}>
      <Ionicons name="call-outline" size={22} color="#2563eb" />
    </TouchableOpacity>
  ) : (
    <View style={styles.headerSide} />
  )}
</View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          {profileImageUrl ? (
            <Image source={{ uri: profileImageUrl }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person-outline" size={28} color="#6b7280" />
          )}
        </View>

        <Text style={styles.name}>
          {profile?.display_name || '알 수 없음'}
        </Text>

        <Text style={styles.sub}>
          {profile?.user_type === 'store' ? '가게 판매자' : '개인 판매자'}
        </Text>

        {isVerifiedStore ? (
          <Text style={styles.verifiedText}>가게인증완료</Text>
        ) : null}

        {isVerifiedStore && (profile?.store_address || hasStoreLocation) ? (
          <View style={styles.storeLocationBox}>
            <View style={styles.storeLocationHeader}>
              <Ionicons name="location-outline" size={17} color="#2563eb" />
              <Text style={styles.storeLocationTitle}>가게 위치</Text>
            </View>

            {profile?.store_address ? (
              <Text style={styles.storeAddress}>{profile.store_address}</Text>
            ) : null}

            {hasStoreLocation ? (
              <TouchableOpacity style={styles.mapBtn} onPress={openStoreMap}>
                <Text style={styles.mapBtnText}>지도에서 위치 확인</Text>
                <Ionicons name="chevron-forward" size={16} color="#2563eb" />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View style={styles.statsRow}>
  <View style={styles.statBox}>
    <Ionicons name="star" size={16} color="#f59e0b" />
    <Text style={styles.statText}>
      {reviewStats.count > 0
        ? `${reviewStats.average.toFixed(1)}점 (${reviewStats.count})`
        : '후기 없음'}
    </Text>
  </View>

  <View style={styles.statBox}>
    <Ionicons name="warning-outline" size={16} color="#ef4444" />
    <Text style={styles.statText}>
      신고 {profile?.reports_count ?? 0}회
    </Text>
  </View>
</View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>판매 중인 물건</Text>

        <View style={styles.list}>
          {items.map((item) => {
            const imagePath = item.listing_images?.[0]?.image_path;
            const imageUrl = imagePath
              ? supabase.storage.from('listing-images').getPublicUrl(imagePath).data.publicUrl
              : null;

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.itemCard}
                onPress={() => router.push(`/(tabs)/home/post/${item.id}` as any)}
              >
                <View style={styles.thumbWrap}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.thumb} />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Ionicons name="image-outline" size={22} color="#9ca3af" />
                    </View>
                  )}
                </View>

                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {item.region || ''}
                  </Text>
                  <Text style={styles.itemPrice} numberOfLines={1}>
                    {item.price_text || '가격 문의'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  headerSide: {
    width: 24,
    height: 24,
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: 24,
    borderRadius: 18,
    backgroundColor: '#f9fafb',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  name: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  sub: {
    marginTop: 4,
    color: '#6b7280',
  },
  verifiedText: {
    marginTop: 6,
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '800',
  },
  storeLocationBox: {
    width: '100%',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  storeLocationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  storeLocationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  storeAddress: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
    fontWeight: '700',
  },
  mapBtn: {
    marginTop: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
  },
  mapBtnText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '800',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  list: {
    gap: 12,
  },
  itemCard: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#fff',
  },

  statsRow: {
  marginTop: 14,
  flexDirection: 'row',
  gap: 10,
},

statBox: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  backgroundColor: '#fff',
  borderWidth: 1,
  borderColor: '#e5e7eb',
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 7,
},

statText: {
  fontSize: 13,
  fontWeight: '800',
  color: '#374151',
},

  thumbWrap: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
  },
  itemMeta: {
    color: '#6b7280',
    fontSize: 13,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
});
