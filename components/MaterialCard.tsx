import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image, Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { supabase } from '../lib/supabase';

type Props = {
  item: any;
  myLatitude?: number | null;
  myLongitude?: number | null;
  onRefresh?: () => void;
  showMenu?: boolean;
};

function getDistanceKm(
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return null;
  }

  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km?: number | null) {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

function formatTimeAgo(dateString?: string) {
  if (!dateString) return '';

  const created = new Date(dateString).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - created) / 1000 / 60);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}

function getListingQuantityInfo(item: any) {
  const total = Math.max(1, Number(item?.quantity_total ?? 1));
  const fallbackRemaining = item?.status === 'done' ? 0 : total;
  const remaining = Math.max(0, Number(item?.quantity_remaining ?? fallbackRemaining));

  return {
    total,
    remaining,
    isMultiQuantity: total > 1,
  };
}

function showCardAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

async function confirmBlockSeller(name: string) {
  const message = `${name}님을 차단할까요?\n차단한 사용자는 내정보에서 해제할 수 있습니다.`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(message);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('판매자 차단', message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: '차단', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function MaterialCard({
  item,
  myLatitude,
  myLongitude,
  onRefresh,
  showMenu = true,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [liked, setLiked] = useState(false);

  const sellerDistanceKm = useMemo(() => {
    return getDistanceKm(
      myLatitude,
      myLongitude,
      item.latitude,
      item.longitude
    );
  }, [myLatitude, myLongitude, item.latitude, item.longitude]);

  const sellerDistanceText = useMemo(() => {
    return formatDistance(sellerDistanceKm);
  }, [sellerDistanceKm]);

  const timeAgo = useMemo(() => formatTimeAgo(item.created_at), [item.created_at]);
  const quantityInfo = useMemo(() => getListingQuantityInfo(item), [item]);
  const shouldCompactBadges =
    Platform.OS === 'android' &&
    item.urgent &&
    item.available_today &&
    item.available_now;

  const firstImagePath = item.listing_images?.[0]?.image_path ?? null;

  const imageUrl = useMemo(() => {
    if (!firstImagePath) return null;
    const { data } = supabase.storage
      .from('listing-images')
      .getPublicUrl(firstImagePath);
    return data.publicUrl;
  }, [firstImagePath]);

  const handleToggleLike = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      if (liked) {
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', data.user.id)
          .eq('listing_id', item.id);
        setLiked(false);
      } else {
        await supabase.from('favorites').insert({
          user_id: data.user.id,
          listing_id: item.id,
        });
        setLiked(true);
      }

      setMenuOpen(false);
      onRefresh?.();
    } catch (e) {
      console.log('관심 처리 실패:', e);
    }
  };

  const handleHide = async () => {
    setMenuOpen(false);
  };

  const handleReport = async () => {
    setMenuOpen(false);
  };

  const handleBlockSeller = async () => {
    const { data } = await supabase.auth.getUser();
    const currentUserId = data.user?.id;
    const sellerId = item.author_id || item.profiles?.id;

    if (!currentUserId) {
      setMenuOpen(false);
      showCardAlert('판매자 차단', '로그인이 필요합니다.');
      router.push('/login' as any);
      return;
    }

    if (!sellerId) {
      setMenuOpen(false);
      showCardAlert('판매자 차단', '차단할 판매자를 찾을 수 없습니다.');
      return;
    }

    if (sellerId === currentUserId) {
      setMenuOpen(false);
      showCardAlert('판매자 차단', '본인은 차단할 수 없습니다.');
      return;
    }

    const sellerName = item.profiles?.display_name || '판매자';
    const ok = await confirmBlockSeller(sellerName);
    if (!ok) return;

    const { error } = await supabase.from('user_blocks').upsert(
      {
        blocker_id: currentUserId,
        blocked_id: sellerId,
      },
      {
        onConflict: 'blocker_id,blocked_id',
      }
    );

    setMenuOpen(false);

    if (error) {
      console.log('판매자 차단 실패:', error);
      showCardAlert(
        '판매자 차단 실패',
        error.message.includes('user_blocks')
          ? 'Supabase SQL 설정이 필요합니다. account_settings.sql을 실행해 주세요.'
          : '차단하지 못했습니다.'
      );
      return;
    }

    showCardAlert('차단 완료', `${sellerName}님을 차단했습니다.`);
    onRefresh?.();
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.card, shouldCompactBadges && styles.compactCard]}
        activeOpacity={0.9}
        onPress={() => router.push(`/(tabs)/home/post/${item.id}` as any)}
      >
        <View style={[styles.row, shouldCompactBadges && styles.compactRow]}>
          {/* 왼쪽 큰 이미지 */}
            <View style={[styles.imageWrap, shouldCompactBadges && styles.compactImageWrap]}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.image} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="image-outline" size={34} color="#9ca3af" />
              </View>
            )}
          </View>

          {/* 오른쪽 정보 */}
          <View style={styles.infoWrap}>
            {/* 배지들 */}
            <View style={[styles.badgesRow, shouldCompactBadges && styles.compactBadgesRow]}>
              <Text
                numberOfLines={1}
                style={[
                  styles.badge,
                  shouldCompactBadges && styles.compactBadge,
                  item.profiles?.user_type === 'store'
                    ? styles.storeBadge
                    : styles.personalBadge,
                ]}
              >
                {item.profiles?.user_type === 'store' ? '가게' : '개인'}
              </Text>

              {item.urgent ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.badge,
                    shouldCompactBadges && styles.compactBadge,
                    styles.urgentBadge,
                  ]}
                >
                  긴급배송
                </Text>
              ) : null}

              {item.available_today ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.badge,
                    shouldCompactBadges && styles.compactBadge,
                    styles.todayBadge,
                  ]}
                >
                  오늘가능
                </Text>
              ) : null}

              {item.available_now ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.badge,
                    shouldCompactBadges && styles.compactBadge,
                    styles.nowBadge,
                  ]}
                >
                  지금가능
                </Text>
              ) : null}
            </View>

            {/* 제목 + 점3개 */}
            <View style={styles.topRow}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>

              {showMenu ? (
                <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.moreBtn}>
                  <Ionicons name="ellipsis-horizontal" size={18} color="#6b7280" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 지역 / 거리 / 시간 */}
            <Text style={styles.meta} numberOfLines={1}>
              {[item.region, sellerDistanceText, timeAgo].filter(Boolean).join(' · ')}
            </Text>

            {/* 가격 */}
            <Text style={styles.price} numberOfLines={1}>
              {item.price_text || '가격 문의'}
            </Text>

            {quantityInfo.isMultiQuantity ? (
              <Text style={styles.stockText} numberOfLines={1}>
                남은 {quantityInfo.remaining}개 / 전체 {quantityInfo.total}개
              </Text>
            ) : null}

            {/* 판매자 */}
            <Text style={styles.sellerName} numberOfLines={1}>
              {item.profiles?.display_name || '이름 없음'}
            </Text>

            {/* 하단 수치 */}
            <View style={styles.bottomRow}>
              <View style={styles.countRow}>
                <Ionicons name="heart-outline" size={14} color="#6b7280" />
                <Text style={styles.countText}>{item.favorites_count ?? 0}</Text>
              </View>

              <View style={styles.countRow}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={14}
                  color="#6b7280"
                />
                <Text style={styles.countText}>{item.chats_count ?? 0}</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <Modal visible={showMenu && menuOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.menuBox}>
                <TouchableOpacity style={styles.menuItem} onPress={handleToggleLike}>
                  <Text style={styles.menuText}>{liked ? '관심없음' : '관심있음'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={handleHide}>
                  <Text style={styles.menuText}>이 글 숨기기</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                  <Text style={[styles.menuText, styles.reportText]}>신고하기</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={handleBlockSeller}>
                  <Text style={[styles.menuText, styles.reportText]}>판매자 차단하기</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={() => setMenuOpen(false)}>
                  <Text style={styles.menuText}>닫기</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
  },

  compactCard: {
    padding: 12,
  },

  row: {
    flexDirection: 'row',
    gap: 14,
  },

  compactRow: {
    gap: 10,
  },

  imageWrap: {
    width: 122,
    height: 122,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },

  compactImageWrap: {
    width: 112,
    height: 112,
    borderRadius: 14,
  },

  image: {
    width: '100%',
    height: '100%',
  },

  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },

  infoWrap: {
    flex: 1,
    justifyContent: 'space-between',
  },

  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    marginBottom: 6,
  },

  compactBadgesRow: {
    gap: 3,
  },

  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },

  compactBadge: {
    fontSize: 9,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 7,
    includeFontPadding: false,
    lineHeight: 14,
  },

  storeBadge: {
    backgroundColor: '#dbeafe',
    color: '#2563eb',
  },

  personalBadge: {
    backgroundColor: '#ecfdf5',
    color: '#16a34a',
  },

  urgentBadge: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
  },

  todayBadge: {
    backgroundColor: '#fef3c7',
    color: '#d97706',
  },

  nowBadge: {
    backgroundColor: '#ede9fe',
    color: '#7c3aed',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },

  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 23,
  },

  moreBtn: {
    paddingTop: 2,
  },

  meta: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
  },

  price: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  stockText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '800',
    color: '#2563eb',
  },

  sellerName: {
    marginTop: 4,
    fontSize: 13,
    color: '#4b5563',
  },

  bottomRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  countText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'flex-end',
    padding: 16,
  },

  menuBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 8,
  },

  menuItem: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },

  menuText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },

  reportText: {
    color: '#dc2626',
  },
});
