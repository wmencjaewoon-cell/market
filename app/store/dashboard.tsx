import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../hooks/use-app-theme';
import { getMyStoreAccessContext } from '../../lib/storeStaff';
import { supabase } from '../../lib/supabase';

export default function StoreDashboardScreen() {
  const { user } = useAuth();
  const theme = useAppTheme();
  const [profile, setProfile] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [chatCount, setChatCount] = useState(0);
  const [interactionCounts, setInteractionCounts] = useState({
    phone: 0,
    directions: 0,
  });
  const [estimateCount, setEstimateCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    const access = await getMyStoreAccessContext();
    const storeUserId = access.storeUserId;
    const profileData = access.storeProfile;

    setProfile(profileData || null);

    if (!access.canManageStore || !storeUserId) {
      setItems([]);
      setChatCount(0);
      setInteractionCounts({ phone: 0, directions: 0 });
      setEstimateCount(0);
      setLoading(false);
      return;
    }

    const { data: listingData } = await supabase
      .from('listings')
      .select('id, title, price_text, status, views_count, quantity_total, quantity_remaining, quantity_unit, created_at')
      .eq('store_user_id', storeUserId)
      .eq('seller_type', 'store')
      .order('created_at', { ascending: false });

    const nextItems = listingData || [];
    setItems(nextItems);

    const listingIds = nextItems.map((item) => item.id);
    if (listingIds.length > 0) {
      const { count } = await supabase
        .from('chat_rooms')
        .select('*', { count: 'exact', head: true })
        .in('listing_id', listingIds);

      setChatCount(count || 0);
    } else {
      setChatCount(0);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: interactions } = await supabase
      .from('store_interactions')
      .select('interaction_type')
      .eq('store_user_id', storeUserId)
      .gte('created_at', todayStart.toISOString());

    setInteractionCounts({
      phone: (interactions || []).filter((row: any) => row.interaction_type === 'phone').length,
      directions: (interactions || []).filter((row: any) => row.interaction_type === 'directions').length,
    });

    const { count: openEstimateCount } = await supabase
      .from('estimate_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');

    setEstimateCount(openEstimateCount || 0);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const isVerifiedStore = profile?.user_type === 'store' && !!profile?.business_verified;
  const activeCount = items.filter((item) => item.status === 'active').length;
  const reservedCount = items.filter((item) => item.status === 'reserved').length;
  const doneCount = items.filter((item) => item.status === 'done').length;
  const hiddenCount = items.filter((item) => item.status === 'hidden').length;
  const totalViews = items.reduce((sum, item) => sum + Number(item.views_count || 0), 0);
  const popularItems = useMemo(
    () => [...items].sort((a, b) => Number(b.views_count || 0) - Number(a.views_count || 0)).slice(0, 3),
    [items]
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '가게 대시보드' }} />

      <Text style={styles.title}>가게 대시보드</Text>

      {!isVerifiedStore ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>가게 인증이 필요합니다</Text>
          <Text style={styles.noticeText}>가게 관리 기능은 가게 인증 완료 계정만 사용할 수 있습니다.</Text>
        </View>
      ) : (
        <>
          <View style={styles.grid}>
            <StatCard label="상품 조회수" value={loading ? '-' : totalViews.toLocaleString()} />
            <StatCard label="채팅 문의" value={loading ? '-' : chatCount.toLocaleString()} />
            <StatCard label="전화 클릭" value={loading ? '-' : interactionCounts.phone.toLocaleString()} />
            <StatCard label="길찾기 클릭" value={loading ? '-' : interactionCounts.directions.toLocaleString()} />
            <StatCard label="견적 문의" value={loading ? '-' : estimateCount.toLocaleString()} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>상품 현황</Text>
            <View style={styles.statusGrid}>
              <StatCard label="판매중" value={`${activeCount}개`} />
              <StatCard label="예약중" value={`${reservedCount}개`} />
              <StatCard label="판매완료" value={`${doneCount}개`} />
              <StatCard label="숨김" value={`${hiddenCount}개`} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>빠른 작업</Text>
            <ActionButton icon="add-circle-outline" label="상품 등록" iconColor={theme.text} chevronColor={theme.textSubtle} onPress={() => router.push('/store/product-create' as any)} />
            <ActionButton icon="cube-outline" label="상품 상태관리" iconColor={theme.text} chevronColor={theme.textSubtle} onPress={() => router.push('/store/products' as any)} />
            <ActionButton icon="clipboard-outline" label="견적/고객관리" iconColor={theme.text} chevronColor={theme.textSubtle} onPress={() => router.push('/store/estimates' as any)} />
            <ActionButton icon="people-outline" label="직원 관리" iconColor={theme.text} chevronColor={theme.textSubtle} onPress={() => router.push('/store/staff' as any)} />
            <ActionButton icon="storefront-outline" label="가게 정보 수정" iconColor={theme.text} chevronColor={theme.textSubtle} onPress={() => router.push('/store/profile' as any)} />
            <ActionButton icon="flash-outline" label="오늘 가능 켜기" iconColor={theme.text} chevronColor={theme.textSubtle} onPress={() => router.push('/store/profile' as any)} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>인기 상품</Text>
            {popularItems.length === 0 ? (
              <Text style={styles.emptyText}>등록된 상품이 없습니다.</Text>
            ) : (
              popularItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.popularRow}
                  onPress={() => router.push(`/(tabs)/home/post/${item.id}` as any)}
                >
                  <View>
                    <Text style={styles.popularTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.popularMeta}>조회 {Number(item.views_count || 0).toLocaleString()}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.textSubtle} />
                </TouchableOpacity>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  iconColor,
  chevronColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  iconColor: string;
  chevronColor: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
      <Ionicons name={icon} size={19} color={iconColor} />
      <Text style={styles.actionText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={chevronColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  title: { color: '#111827', fontSize: 24, fontWeight: '900' },
  noticeBox: {
    borderRadius: 14,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    gap: 6,
  },
  noticeTitle: { color: '#9a3412', fontSize: 16, fontWeight: '900' },
  noticeText: { color: '#7c2d12', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '48%',
    minHeight: 82,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef2f7',
    padding: 14,
    justifyContent: 'space-between',
  },
  statLabel: { color: '#6b7280', fontSize: 13, fontWeight: '800' },
  statValue: { color: '#111827', fontSize: 22, fontWeight: '900' },
  section: { gap: 10 },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '900' },
  actionBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef2f7',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionText: { flex: 1, color: '#111827', fontSize: 15, fontWeight: '800' },
  popularRow: {
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef2f7',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  popularTitle: { color: '#111827', fontSize: 15, fontWeight: '900' },
  popularMeta: { marginTop: 3, color: '#6b7280', fontSize: 12, fontWeight: '700' },
  emptyText: { color: '#6b7280', fontSize: 14, fontWeight: '700' },
});
