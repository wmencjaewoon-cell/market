import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FloatingCreateButton from '../../../components/FloatingCreateButton';
import MaterialCard from '../../../components/MaterialCard';
import RadiusSlider from '../../../components/RadiusSlider';
import { type AppPalette } from '../../../contexts/theme';
import { useAppTheme } from '../../../hooks/use-app-theme';
import { getUnreadNotificationCount } from '../../../lib/notificationsData';
import {
  deleteMyRegion,
  fetchMyRegions,
  fetchMyRegionSettings,
  getDistanceKm,
  saveMyRegionSettings,
} from '../../../lib/region';
import { supabase } from '../../../lib/supabase';
import { useTabRefresh } from '../../../lib/tabRefresh';
import { Listing } from '../../../types';

const tabs = ['전체', '가게', '거래', '나눔', '구함'] as const;
type FilterTab = (typeof tabs)[number];

function getShortRegionName(regionName?: string | null) {
  if (!regionName) return '';

  const parts = regionName.trim().split(/\s+/);
  const townName = [...parts]
    .reverse()
    .find((part) => /[읍면동가]$/.test(part));

  return townName || parts.at(-1) || '';
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [selectedTab, setSelectedTab] = useState<FilterTab>('전체');
  const [items, setItems] = useState<Listing[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeRegionId, setActiveRegionId] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [regionMessage, setRegionMessage] = useState('');

  useEffect(() => {
    fetchListings();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchRegionState();
      fetchNotificationCount();
    }, [])
  );

  const fetchRegionState = async () => {
    const myRegions = await fetchMyRegions();
    const settings = await fetchMyRegionSettings();

    setRegions(myRegions);
    setActiveRegionId(settings?.active_region_id ?? myRegions?.[0]?.id ?? null);
    setRadiusKm(settings?.radius_km ?? 5);
  };

  const fetchListings = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id;
    let blockedIds = new Set<string>();
    let hiddenListingIds = new Set<number>();

    if (currentUserId) {
      const [blockResult, hiddenResult] = await Promise.all([
        supabase
          .from('user_blocks')
          .select('blocked_id')
          .eq('blocker_id', currentUserId),
        supabase
          .from('hidden_listings')
          .select('listing_id')
          .eq('user_id', currentUserId),
      ]);

      const { data: blockRows, error: blockError } = blockResult;
      const { data: hiddenRows, error: hiddenError } = hiddenResult;

      if (blockError) {
        console.log('홈 차단 목록 조회 실패:', blockError);
      } else {
        blockedIds = new Set((blockRows || []).map((row: any) => row.blocked_id));
      }

      if (hiddenError) {
        console.log('홈 숨김 게시글 조회 실패:', hiddenError);
      } else {
        hiddenListingIds = new Set((hiddenRows || []).map((row: any) => Number(row.listing_id)));
      }
    }

    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        profiles!listings_author_id_fkey (
          id,
          display_name,
          user_type,
          business_verified,
          phone,
          is_phone_public,
          trust_points,
          trust_level,
          seller_level_style,
          show_level_on_posts
        ),
        listing_images (
          id,
          image_path,
          sort_order
        )
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const mapped = (data as any[])
        .filter((item) => !blockedIds.has(item.author_id))
        .filter((item) => !hiddenListingIds.has(Number(item.id)))
        .map((item) => ({
          ...item,
          favorites_count: item.favorites_count ?? 0,
          chats_count: item.chats_count ?? 0,
          listing_images: [...(item.listing_images || [])].sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
          ),
        }));
      setItems(mapped as Listing[]);
    }
  };

  const fetchNotificationCount = async () => {
    try {
      const count = await getUnreadNotificationCount();
      setUnreadNotificationCount(count);
    } catch (e) {
      console.log(e);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        fetchListings(),
        fetchRegionState(),
        fetchNotificationCount(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  useTabRefresh('home', () => {
    void handleRefresh();
  });

  const handleSelectRegion = async (region: any) => {
    await saveMyRegionSettings(region.id, radiusKm);
    setActiveRegionId(region.id);
    setRegionModalOpen(false);
    await fetchRegionState();
  };

  const handleSaveRadius = async (nextRadius: number) => {
    try {
      setRadiusKm(nextRadius);
      await saveMyRegionSettings(activeRegionId, nextRadius);
    } catch (e: any) {
      setRegionMessage(e?.message || '반경 저장에 실패했습니다.');
    }
  };

  const handleDeleteRegion = async (regionId: number) => {
    try {
      await deleteMyRegion(regionId);
      await fetchRegionState();
    } catch (e: any) {
      setRegionMessage(e?.message || '동네 삭제에 실패했습니다.');
    }
  };

  const activeRegion = regions.find((r) => r.id === activeRegionId);

  const filtered = useMemo(() => {
    let result = [...items];

    if (activeRegion?.latitude != null && activeRegion?.longitude != null) {
      result = result.filter((item) => {
        const distance = getDistanceKm(
          activeRegion.latitude,
          activeRegion.longitude,
          item.latitude,
          item.longitude
        );

        return distance != null && distance <= radiusKm;
      });
    } else if (activeRegion?.region_name) {
      result = result.filter((item) => item.region === activeRegion.region_name);
    }

    if (selectedTab === '가게') {
      result = result.filter(
        (item: any) =>
          item.profiles?.user_type === 'store' && !!item.profiles?.business_verified
      );
    }

    if (selectedTab === '거래') {
      result = result.filter((item) => item.category === 'trade');
    }

    if (selectedTab === '나눔') {
      result = result.filter((item) => item.category === 'share');
    }

    if (selectedTab === '구함') {
      result = result.filter((item) => item.category === 'want');
    }

    const keyword = searchKeyword.trim().toLowerCase();

    if (keyword) {
      result = result.filter((item: any) => {
        const searchableText = [
          item.title,
          item.description,
          item.region,
          item.category,
          item.profiles?.display_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(keyword);
      });
    }

    return result;
  }, [items, selectedTab, activeRegion, radiusKm, searchKeyword]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.regionBtn}
            onPress={() => {
              setRegionMessage('');
              setRegionModalOpen(true);
            }}
          >
            <Text style={styles.regionText}>
              {getShortRegionName(activeRegion?.region_name) || '내 동네 설정'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={theme.text} />
          </TouchableOpacity>

          <View style={styles.topRight}>
            <TouchableOpacity
              style={styles.notificationBtn}
              onPress={() => router.push('../my/notifications' as any)}
            >
              <Ionicons
                name="notifications-outline"
                size={24}
                color={theme.text}
              />

              {unreadNotificationCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadNotificationCount > 99
                      ? '99+'
                      : unreadNotificationCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>

            <Text style={styles.radiusBadge}>{radiusKm}km</Text>
          </View>
        </View>
        <View style={styles.homeSearchBox}>
          <Ionicons name="search-outline" size={20} color={theme.textSubtle} />

          <TextInput
            style={styles.homeSearchInput}
            value={searchKeyword}
            onChangeText={setSearchKeyword}
            placeholder="상품명, 가게명을 검색해보세요"
            placeholderTextColor={theme.textSubtle}
            returnKeyType="search"
          />

          {searchKeyword.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchKeyword('')}>
              <Ionicons name="close-circle" size={20} color={theme.textSubtle} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/estimate/create' as any)}
          >
            <View style={styles.quickIconBox}>
              <Ionicons name="construct-outline" size={20} color={theme.primary} />
            </View>
            <View style={styles.quickTextBox}>
              <Text style={styles.quickTitle}>견적문의</Text>
              <Text style={styles.quickDesc}>공사 상담 요청</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/store' as any)}
          >
            <View style={styles.quickIconBox}>
              <Ionicons name="storefront-outline" size={20} color={theme.primary} />
            </View>
            <View style={styles.quickTextBox}>
              <Text style={styles.quickTitle}>가게 찾기</Text>
              <Text style={styles.quickDesc}>인증 가게 보기</Text>
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {tabs.map((tab) => {
            const active = selectedTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setSelectedTab(tab)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.list}>
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <MaterialCard key={item.id} item={item} onRefresh={fetchListings} />
            ))
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="search-outline" size={36} color={theme.textSubtle} />
              <Text style={styles.emptyTitle}>검색 결과가 없어요</Text>
              <Text style={styles.emptyDesc}>
                다른 검색어를 입력하거나 동네 범위를 넓혀보세요.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={regionModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.regionModalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>내 동네 설정</Text>

              <TouchableOpacity onPress={() => setRegionModalOpen(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>보고 싶은 동네를 선택해 주세요.</Text>
            <View style={styles.radiusBox}>
              <View style={styles.radiusHeader}>
                <Text style={styles.radiusTitle}>보여줄 범위</Text>
                <Text style={styles.radiusValue}>{radiusKm}km</Text>
              </View>

              <RadiusSlider
                min={1}
                max={30}
                step={1}
                value={radiusKm}
                onChangeEnd={handleSaveRadius}
              />

              <Text style={styles.radiusHelp}>
                선택한 동네 기준으로 {radiusKm}km 안의 게시글을 보여줍니다.
              </Text>
            </View>

            {regions.map((region) => {
              const active = region.id === activeRegionId;

              return (
                <View key={region.id} style={styles.regionModalItem}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => handleSelectRegion(region)}
                  >
                    <Text style={[styles.modalRegionName, active && styles.modalRegionActive]}>
                      {region.region_name}
                    </Text>

                    <Text style={styles.modalRegionSub}>
                      {active
                        ? '현재 선택된 동네'
                        : region.verified
                          ? '인증 완료'
                          : '검색으로 추가됨'}
                    </Text>
                  </TouchableOpacity>

                  {active ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                  ) : (
                    <TouchableOpacity onPress={() => handleDeleteRegion(region.id)}>
                      <Ionicons name="trash-outline" size={20} color={theme.textSubtle} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.addRegionBtn}
              onPress={() => {
                setRegionModalOpen(false);
                router.push('/(tabs)/home/region-search' as any);
              }}
            >
              <Ionicons name="add" size={20} color={theme.primary} />
              <Text style={styles.addRegionText}>동네 추가</Text>
            </TouchableOpacity>

            {regionMessage ? <Text style={styles.regionMessage}>{regionMessage}</Text> : null}
          </View>
        </View>
      </Modal>

      <FloatingCreateButton />
    </SafeAreaView>
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 120 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  regionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  regionText: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.text,
  },
  radiusBadge: {
    backgroundColor: theme.primarySoft,
    color: theme.primary,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tabRow: {
    gap: 8,
    paddingTop: 16,
    paddingBottom: 14,
  },
  tabBtn: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  tabBtnActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },

  homeSearchBox: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.input,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  homeSearchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.text,
    paddingVertical: 0,
  },
  quickRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  quickCard: {
    flex: 1,
    minHeight: 66,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTextBox: {
    flex: 1,
    minWidth: 0,
  },
  quickTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '900',
  },
  quickDesc: {
    marginTop: 3,
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tabText: { fontWeight: '700', color: theme.textMuted },
  tabTextActive: { color: theme.primaryText },
  list: { gap: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.overlay,
    justifyContent: 'flex-end',
    padding: 16,
  },

  regionModalBox: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    padding: 16,
    maxHeight: '85%',
    gap: 12,
  },

  radiusBox: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    backgroundColor: theme.surfaceMuted,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.textMuted,
  },

  emptyDesc: {
    fontSize: 14,
    color: theme.textSubtle,
    textAlign: 'center',
  },

  radiusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  radiusTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.text,
  },

  radiusValue: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.primary,
  },

  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  notificationBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },

  notificationBadgeText: {
    color: theme.primaryText,
    fontSize: 10,
    fontWeight: '800',
  },

  radiusHelp: {
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 19,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.text,
  },

  modalDesc: {
    color: theme.textMuted,
    lineHeight: 20,
  },

  regionModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },

  modalRegionName: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.text,
  },

  modalRegionActive: {
    color: theme.primary,
  },

  modalRegionSub: {
    marginTop: 4,
    color: theme.textMuted,
    fontSize: 13,
  },

  addRegionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
    borderRadius: 14,
    padding: 14,
  },

  addRegionText: {
    color: theme.primary,
    fontWeight: '800',
  },

  backMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  backMiniText: {
    fontWeight: '800',
    color: theme.text,
  },

  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },

  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  searchBtn: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchBtnText: {
    color: theme.primaryText,
    fontWeight: '800',
  },

  locationSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.text,
    borderRadius: 14,
    padding: 14,
  },

  locationSearchText: {
    color: theme.background,
    fontWeight: '800',
  },

  candidateItem: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: theme.surfaceMuted,
  },

  candidateText: {
    fontWeight: '800',
    color: theme.text,
  },

  regionMessage: {
    color: theme.danger,
    fontWeight: '700',
  },
});
}
