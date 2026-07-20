import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../contexts/AuthContext';
import { useAppTheme } from '../../../../hooks/use-app-theme';
import { getProfileImageUrl } from '../../../../lib/profileImage';
import {
  getSellerLevel,
  getSellerLevelProgress,
  getSellerLevelStyle,
  getSellerLevelTitle,
  getSellerPoints,
} from '../../../../lib/sellerLevel';
import { getStoreCategoryLabel } from '../../../../lib/storeCategories';
import { supabase } from '../../../../lib/supabase';

type ListingFilter = 'all' | 'selling' | 'done';

function showProfileAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

async function confirmBlockUser(name: string) {
  const message = `${name}님을 차단할까요?\n차단하면 차단한 사용자 목록에서 해제할 수 있습니다.`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(message);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('차단하기', message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: '차단', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const theme = useAppTheme();
  const backIconColor = theme.scheme === 'dark' ? '#fff' : theme.text;
  const [menuOpen, setMenuOpen] = useState(false);
  const [reviewStats, setReviewStats] = useState({
  count: 0,
});

  const [profile, setProfile] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [listingStats, setListingStats] = useState({
    total: 0,
    selling: 0,
    done: 0,
  });
  const [selectedListingFilter, setSelectedListingFilter] =
    useState<ListingFilter>('all');

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
    const [listingResult, statsResult] = await Promise.all([
      supabase
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
        .in('status', ['active', 'reserved', 'done'])
        .order('created_at', { ascending: false }),
      supabase
        .from('listings')
        .select('id, status')
        .eq('author_id', userId)
        .in('status', ['active', 'reserved', 'done']),
    ]);

    if (!listingResult.error && listingResult.data) {
      setItems(listingResult.data);
    }

    if (!statsResult.error && statsResult.data) {
      const statsRows = statsResult.data || [];

      setListingStats({
        total: statsRows.length,
        selling: statsRows.filter((item: any) => item.status === 'active' || item.status === 'reserved')
          .length,
        done: statsRows.filter((item: any) => item.status === 'done').length,
      });
    }
  };

  const fetchReviewStats = async () => {
  const { count, error } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('target_user_id', userId);

  if (error) {
    console.log('후기 통계 조회 실패:', error);
    return;
  }

  setReviewStats({
    count: count || 0,
  });
};

  const profileImageUrl = getProfileImageUrl(profile?.avatar_path || profile?.avatar_url);
  const isVerifiedStore = profile?.user_type === 'store' && !!profile?.business_verified;
  const sellerFallbackPoints = reviewStats.count * 100;
  const sellerPoints = getSellerPoints(profile, sellerFallbackPoints);
  const sellerLevel = getSellerLevel(profile, sellerFallbackPoints);
  const sellerLevelStyle = getSellerLevelStyle(profile, sellerLevel);
  const sellerProgress = getSellerLevelProgress(sellerPoints);
  const showSellerLevel = profile?.show_level_on_profile !== false;
  const hasStoreLocation =
    isVerifiedStore &&
    profile?.store_latitude != null &&
    profile?.store_longitude != null;
  const canCallStore =
    isVerifiedStore &&
    !!profile?.phone;
  const isMyProfile = user?.id === userId;

  const filteredItems = items.filter((item) => {
    if (selectedListingFilter === 'all') return true;
    if (selectedListingFilter === 'selling') {
      return item.status === 'active' || item.status === 'reserved';
    }
    if (selectedListingFilter === 'done') return item.status === 'done';
    return true;
  });

  const sectionTitle =
    selectedListingFilter === 'selling'
      ? '판매중인 물건'
      : selectedListingFilter === 'done'
      ? '거래완료된 물건'
      : '전체 물건';

  const getListingStatusLabel = (status?: string | null) => {
    if (status === 'reserved') return '예약중';
    if (status === 'done') return '거래완료';
    return '판매중';
  };

  const handleCall = async () => {
  if (!canCallStore) return;

  const phone = String(profile.phone).replace(/[^0-9]/g, '');
  if (!phone) {
    showProfileAlert('전화하기', '등록된 전화번호를 확인하지 못했습니다.');
    return;
  }

  try {
    await Linking.openURL(`tel:${phone}`);
  } catch (e) {
    console.log('전화 연결 실패:', e);
    showProfileAlert('전화하기', '전화 앱을 열지 못했습니다.');
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

  const handleBlock = async () => {
    setMenuOpen(false);

    if (!user) {
      showProfileAlert('차단하기', '로그인이 필요합니다.');
      router.push('/login' as any);
      return;
    }

    if (!userId || isMyProfile) {
      showProfileAlert('차단하기', '본인은 차단할 수 없습니다.');
      return;
    }

    const targetName = profile?.display_name || '사용자';
    const ok = await confirmBlockUser(targetName);
    if (!ok) return;

    const { error } = await supabase.from('user_blocks').upsert(
      {
        blocker_id: user.id,
        blocked_id: userId,
      },
      {
        onConflict: 'blocker_id,blocked_id',
      }
    );

    if (error) {
      console.log('판매자 정보 차단 실패:', error);
      showProfileAlert(
        '차단 실패',
        error.message.includes('user_blocks')
          ? 'Supabase SQL 설정이 필요합니다. account_settings.sql을 실행해 주세요.'
          : '차단하지 못했습니다.'
      );
      return;
    }

    showProfileAlert('차단 완료', `${targetName}님을 차단했습니다.`);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
  <TouchableOpacity onPress={() => router.back()}>
    <Ionicons name="chevron-back" size={24} color={backIconColor} />
  </TouchableOpacity>

  <Text style={styles.headerTitle}>판매자 정보</Text>

  <View style={styles.headerActions}>
    {canCallStore ? (
      <TouchableOpacity style={styles.headerIconBtn} onPress={handleCall}>
        <Ionicons name="call-outline" size={22} color={theme.primary} />
      </TouchableOpacity>
    ) : null}

    {!isMyProfile ? (
      <TouchableOpacity style={styles.headerIconBtn} onPress={() => setMenuOpen(true)}>
        <Ionicons name="ellipsis-vertical" size={22} color={backIconColor} />
      </TouchableOpacity>
    ) : (
      <View style={styles.headerSide} />
    )}
  </View>
</View>

      <View
        style={[
          styles.profileCard,
          {
            borderColor: theme.border,
            backgroundColor: theme.surface,
          },
          showSellerLevel &&
            theme.scheme !== 'dark' && {
              borderColor: sellerLevelStyle.borderColor,
              backgroundColor: sellerLevelStyle.backgroundColor,
            },
        ]}
      >
        <View style={styles.avatar}>
          {profileImageUrl ? (
            <Image source={{ uri: profileImageUrl }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person-outline" size={28} color={theme.textMuted} />
          )}
        </View>

        <Text style={styles.name}>
          {profile?.display_name || '알 수 없음'}
        </Text>

        <Text style={styles.sub}>
          {isVerifiedStore ? '가게 판매자' : '개인 판매자'}
        </Text>

        {isVerifiedStore ? (
          <Text style={styles.verifiedText}>가게인증완료</Text>
        ) : null}

        {isVerifiedStore ? (
          <Text style={styles.storeCategoryText}>
            {getStoreCategoryLabel(profile?.store_category)}
          </Text>
        ) : null}

        {showSellerLevel ? (
          <View
            style={[
              styles.levelBox,
              theme.scheme === 'dark' && { backgroundColor: theme.surfaceMuted },
            ]}
          >
            <Text
              style={[
                styles.levelText,
                { color: theme.scheme === 'dark' ? theme.text : sellerLevelStyle.textColor },
              ]}
            >
              LV.{sellerLevel} {getSellerLevelTitle(sellerLevel)}
            </Text>
            <Text style={styles.levelMeta}>
              후기 {reviewStats.count}개 · {sellerPoints.toLocaleString()} XP
            </Text>
            <View style={styles.levelTrack}>
              <View style={[styles.levelFill, { width: `${sellerProgress.percent}%` }]} />
            </View>
          </View>
        ) : null}

        {isVerifiedStore && (profile?.store_address || hasStoreLocation) ? (
          <View style={styles.storeLocationBox}>
            <View style={styles.storeLocationHeader}>
              <Ionicons name="location-outline" size={17} color={theme.primary} />
              <Text style={styles.storeLocationTitle}>가게 위치</Text>
            </View>

            {profile?.store_address ? (
              <Text style={styles.storeAddress}>{profile.store_address}</Text>
            ) : null}

            {hasStoreLocation ? (
              <TouchableOpacity style={styles.mapBtn} onPress={openStoreMap}>
                <Text style={styles.mapBtnText}>지도에서 위치 확인</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View style={styles.statsRow}>
  <View style={styles.statBox}>
    <Ionicons name="ribbon-outline" size={16} color={theme.primary} />
    <Text style={styles.statText}>
      후기 {reviewStats.count}개
    </Text>
  </View>

  <View style={styles.statBox}>
    <Ionicons name="warning-outline" size={16} color="#ef4444" />
    <Text style={styles.statText}>
      신고 {profile?.reports_count ?? 0}회
    </Text>
  </View>
</View>

        <View style={styles.listingStatsRow}>
          <TouchableOpacity
            style={[
              styles.listingStatBox,
              selectedListingFilter === 'all' && styles.listingStatBoxActive,
            ]}
            onPress={() => setSelectedListingFilter('all')}
          >
            <Text
              style={[
                styles.listingStatValue,
                selectedListingFilter === 'all' && styles.listingStatValueActive,
              ]}
            >
              {listingStats.total}
            </Text>
            <Text
              style={[
                styles.listingStatLabel,
                selectedListingFilter === 'all' && styles.listingStatLabelActive,
              ]}
            >
              전체 물품
            </Text>
          </TouchableOpacity>

          <View style={styles.listingStatDivider} />

          <TouchableOpacity
            style={[
              styles.listingStatBox,
              selectedListingFilter === 'selling' && styles.listingStatBoxActive,
            ]}
            onPress={() => setSelectedListingFilter('selling')}
          >
            <Text
              style={[
                styles.listingStatValue,
                selectedListingFilter === 'selling' && styles.listingStatValueActive,
              ]}
            >
              {listingStats.selling}
            </Text>
            <Text
              style={[
                styles.listingStatLabel,
                selectedListingFilter === 'selling' && styles.listingStatLabelActive,
              ]}
            >
              판매중
            </Text>
          </TouchableOpacity>

          <View style={styles.listingStatDivider} />

          <TouchableOpacity
            style={[
              styles.listingStatBox,
              selectedListingFilter === 'done' && styles.listingStatBoxActive,
            ]}
            onPress={() => setSelectedListingFilter('done')}
          >
            <Text
              style={[
                styles.listingStatValue,
                selectedListingFilter === 'done' && styles.listingStatValueActive,
              ]}
            >
              {listingStats.done}
            </Text>
            <Text
              style={[
                styles.listingStatLabel,
                selectedListingFilter === 'done' && styles.listingStatLabelActive,
              ]}
            >
              거래완료
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>

        <View style={styles.list}>
          {filteredItems.length === 0 ? (
            <Text style={styles.emptyText}>해당 상태의 물품이 없습니다.</Text>
          ) : null}

          {filteredItems.map((item) => {
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
                      <Ionicons name="image-outline" size={22} color={theme.textSubtle} />
                    </View>
                  )}
                </View>

                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.itemStatus}>{getListingStatusLabel(item.status)}</Text>
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

    <Modal visible={menuOpen} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
        <View style={styles.menuOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.menuBox}>
              <TouchableOpacity style={styles.menuItem} onPress={handleBlock}>
                <Text style={styles.blockText}>차단하기</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => setMenuOpen(false)}>
                <Text style={styles.menuText}>취소</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    </SafeAreaView>
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
  headerActions: {
    minWidth: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#f9fafb',
  },
  storeCategoryText: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '900',
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
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 999,
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
  },
  levelBox: {
    width: '100%',
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.74)',
    padding: 12,
    alignItems: 'center',
  },
  levelText: {
    fontSize: 15,
    fontWeight: '900',
  },
  levelMeta: {
    marginTop: 4,
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '800',
  },
  levelTrack: {
    width: '100%',
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.12)',
    marginTop: 10,
    overflow: 'hidden',
  },
  levelFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#111827',
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
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 18,
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

  listingStatsRow: {
    width: '100%',
    marginTop: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  listingStatBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingVertical: 8,
  },

  listingStatBoxActive: {
    backgroundColor: '#111827',
  },

  listingStatValue: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
  },

  listingStatValueActive: {
    color: '#fff',
  },

  listingStatLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '800',
  },

  listingStatLabelActive: {
    color: '#fff',
  },

  listingStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#e5e7eb',
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
  itemStatus: {
    alignSelf: 'flex-start',
    color: '#2563eb',
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: '900',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'flex-end',
    paddingTop: 62,
    paddingRight: 14,
  },
  menuBox: {
    width: 180,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  menuText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },
  blockText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '800',
  },
});
