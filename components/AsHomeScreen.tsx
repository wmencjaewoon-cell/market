import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useAppTheme } from '../hooks/use-app-theme';
import { getAsPalette, type AsPalette } from '../lib/asAppearance';
import { fetchAsHomeReviews, type AsHomeReview } from '../lib/asHomeData';
import { fetchAsHomeVisits, type AsHomeVisit } from '../lib/asHomeVisits';
import { AS_HOME_CATEGORIES } from '../lib/asInquiry';
import { fetchMyRegions, fetchMyRegionSettings } from '../lib/region';
import { supabase } from '../lib/supabase';
import { useTabRefresh } from '../lib/tabRefresh';
import AsServiceHeader from './AsServiceHeader';
import InlineMap from './InlineMap';
import AsHomeVisitSection from './AsHomeVisitSection';

// 실제 후기가 충분히 쌓이면 true로 변경한다. 숨긴 동안에는 조회 요청도 보내지 않는다.
const SHOW_AS_HOME_REVIEWS = false;
const CATEGORY_ROWS = [AS_HOME_CATEGORIES.slice(0, 3), AS_HOME_CATEGORIES.slice(3, 6)];

type RecentInquiry = { id: number; title: string; created_at: string };
const shortcuts = [
  { label: '내 문의', detail: '접수 내역', icon: 'clipboard-outline', route: '/my/inquiries', tone: 'primary' },
  { label: '근처 가게', detail: '철물 · 자재점', icon: 'storefront-outline', route: '/store', tone: 'accentText' },
  { label: '장터 보기', detail: '중고 & 나눔', icon: 'construct-outline', route: '/explore', tone: 'positive' },
] as const;

export default function AsHomeScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const base = useAppTheme();
  const theme = useMemo(() => getAsPalette(base), [base]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [recent, setRecent] = useState<{ userId: string; inquiry: RecentInquiry | null; count: number } | null>(null);
  const [visitResult, setVisitResult] = useState<{ userId: string; visits: AsHomeVisit[] } | null>(null);
  const [visitsFailed, setVisitsFailed] = useState(false);
  const [reviews, setReviews] = useState<AsHomeReview[]>([]);
  const [reviewsFailed, setReviewsFailed] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestVersion = useRef(0);
  const navigating = useRef(false);
  const myRecent = recent?.userId === userId ? recent : null;

  const navigate = (href: Href) => {
    if (navigating.current) return;
    navigating.current = true;
    router.navigate(href);
  };
  const startInquiry = (category = '간단 AS') => navigate({ pathname: '/(tabs)/as-inquiry', params: { category } });

  const loadHome = useCallback(async (refresh = false) => {
    const version = ++requestVersion.current;
    setRefreshing(refresh);
    setLoading(true);
    setVisitsFailed(false);
    setReviewsFailed(false);
    const [inquiry, feedback, regions, visits] = await Promise.allSettled([
      userId ? supabase.from('estimate_requests').select('id, title, created_at', { count: 'exact' })
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve(null),
      SHOW_AS_HOME_REVIEWS ? fetchAsHomeReviews() : Promise.resolve([] as AsHomeReview[]),
      Promise.all([fetchMyRegions(), fetchMyRegionSettings()]),
      userId ? fetchAsHomeVisits(userId) : Promise.resolve([] as AsHomeVisit[]),
    ]);
    // 계정 전환이나 화면 이탈 후 늦게 도착한 응답은 적용하지 않는다.
    if (version !== requestVersion.current) return;
    if (inquiry.status === 'fulfilled' && !inquiry.value?.error) {
      setRecent(userId ? { userId, inquiry: inquiry.value?.data ?? null, count: inquiry.value?.count ?? 0 } : null);
    } else {
      setRecent(null);
    }
    setVisitResult(userId && visits.status === 'fulfilled' ? { userId, visits: visits.value } : null);
    setVisitsFailed(visits.status === 'rejected');
    setReviews(feedback.status === 'fulfilled' ? feedback.value : []);
    setReviewsFailed(feedback.status === 'rejected');
    if (regions.status === 'fulfilled') {
      const [items, settings] = regions.value;
      const active = items.find((item) => item.id === settings?.active_region_id) || items[0];
      setLocation(active && Number.isFinite(active.latitude) && Number.isFinite(active.longitude) ? { latitude: active.latitude, longitude: active.longitude } : null);
    }
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    navigating.current = false;
    setRecent(null);
    setVisitResult(null);
    setLocation(null);
    void loadHome();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void loadHome();
    });
    return () => { requestVersion.current += 1; subscription.remove(); };
  }, [loadHome]));
  useTabRefresh('home', () => { void loadHome(true); });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AsServiceHeader />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadHome(true)} tintColor={theme.primary} colors={[theme.action]} />}>
        <View style={styles.greeting}>
          <View style={styles.flex}>
            <View style={styles.inline}><View style={styles.statusDot} /><Text style={styles.muted}>사진·영상으로 간편하게 접수하세요</Text></View>
            <Text style={styles.greetingTitle}>어디가 고장났나요?{'\n'}<Text style={{ color: theme.primary }}>수리를 도와드려요!</Text></Text>
          </View>
          <Image source={require('../assets/images/interior-market.jpg')} style={styles.greetingLogo} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}><Ionicons name="shield-checkmark-outline" size={16} color="#fff" /><Text style={styles.heroEyebrow}>간편 집수리 AS 접수</Text></View>
          <Text style={styles.heroTitle}>사진 한 장 찍어 올리면{'\n'}상담부터 업체 연결까지</Text>
          <Text style={styles.heroDescription}>설명하기 어려워도 괜찮아요. 사진이나 짧은 영상으로 고장 난 곳을 보여주세요.</Text>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="수리 AS 문의하기" onPress={() => startInquiry()}>
            <Ionicons name="camera" size={24} color="#fff" /><Text style={styles.primaryText}>수리 AS 문의하기</Text><Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.shortcuts}>
          {shortcuts.map((item) => <TouchableOpacity key={item.label} style={styles.shortcut} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => navigate(item.route as Href)}>
            <View style={[styles.shortcutIcon, item.tone === 'positive' && { backgroundColor: theme.positiveSoft }]}><Ionicons name={item.icon} size={22} color={theme[item.tone]} /></View>
            <Text style={styles.shortcutText}>{item.label}</Text>
            <Text style={[styles.shortcutDetail, item.label === '내 문의' && { color: theme.primary }]}>{item.label === '내 문의' && myRecent ? `문의 ${myRecent.count}건` : item.detail}</Text>
          </TouchableOpacity>)}
        </View>

        <TouchableOpacity style={styles.emergency} accessibilityRole="button" onPress={() => startInquiry('누수/배관')}>
          <View style={styles.emergencyIcon}><Ionicons name="flash" size={24} color="#783200" /></View>
          <View style={styles.flex}><Text style={styles.emergencyTitle}>갑작스런 누수·누전?</Text><Text style={styles.emergencyDescription}>고장 상황을 남기고 상담을 받아보세요</Text></View>
          <Ionicons name="chevron-forward" size={22} color={theme.accentText} />
        </TouchableOpacity>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.flex}><Text style={styles.sectionTitle}>분야별 빠른 접수</Text><Text style={styles.muted}>고장 난 곳을 선택해 주세요</Text></View>
            <TouchableOpacity style={styles.textButton} accessibilityRole="button" onPress={() => startInquiry()}><Text style={styles.linkText}>전체보기</Text></TouchableOpacity>
          </View>
          <View style={styles.categoryGrid} testID="as-home-categories">
            {/* ScrollView 안의 백분율 높이는 줄바꿈 높이를 잘못 키울 수 있어 두 행으로 나눈다. */}
            {CATEGORY_ROWS.map((row, rowIndex) => <View key={rowIndex} style={styles.categoryRow}>
              {row.map((item, index) => <TouchableOpacity key={item.category} style={styles.category} accessibilityRole="button" accessibilityLabel={`${item.label} 문의`} onPress={() => startInquiry(item.category)}>
                <View style={styles.categoryIcon}><Ionicons name={item.icon} size={27} color={index === 1 ? theme.accentText : index === 2 ? theme.positive : theme.primary} /></View>
                <Text style={styles.categoryTitle}>{item.label}</Text><Text style={styles.categoryDetail}>{item.detail}</Text>
              </TouchableOpacity>)}
            </View>)}
          </View>
        </View>

        <AsHomeVisitSection
          key={userId || 'guest'} theme={theme} loggedIn={!!userId} loading={loading}
          failed={visitsFailed} visits={visitResult?.userId === userId ? visitResult?.visits ?? [] : []}
          onRetry={() => void loadHome(true)} navigate={navigate}
        />

        {SHOW_AS_HOME_REVIEWS ? <View style={styles.section}>
          <Text style={styles.sectionTitle}>이웃들의 가게 이용 후기</Text><Text style={styles.muted}>실제 이용자가 남긴 이야기</Text>
          {loading ? <ActivityIndicator color={theme.primary} /> : reviewsFailed ? <TouchableOpacity style={styles.emptyReview} accessibilityRole="button" onPress={() => void loadHome(true)}><Ionicons name="refresh" size={24} color={theme.primary} /><Text style={styles.muted}>후기 다시 불러오기</Text></TouchableOpacity>
            : !reviews.length ? <View style={styles.emptyReview}><Ionicons name="chatbubbles-outline" size={30} color={theme.primary} /><Text style={styles.rowText}>등록된 가게 후기가 아직 없어요</Text></View>
            : reviews.map((review) => <TouchableOpacity key={review.id} style={styles.review} accessibilityRole="button" accessibilityLabel={`${review.storeName} 후기 보기`} onPress={() => navigate({ pathname: '/store/[id]', params: { id: review.target_user_id } })}>
              <View style={styles.inline}><View style={styles.reviewAvatar}><Ionicons name="person-outline" size={19} color={theme.primary} /></View><View style={styles.flex}><Text style={styles.rowText}>가게 이용자</Text><Text style={styles.muted}>{new Date(review.created_at).toLocaleDateString('ko-KR')}</Text></View><Text style={styles.reviewSentiment}>{review.sentiment === 'negative' ? '아쉬웠어요' : review.sentiment === 'positive' ? '좋았어요' : '이용 후기'}</Text></View>
              {review.comment ? <Text style={styles.reviewBody} numberOfLines={4}>{review.comment}</Text> : null}
              {review.images.length > 0 ? <View style={styles.reviewImages}>{review.images.map((photo) => <Image key={photo.image_path} source={{ uri: supabase.storage.from('review-images').getPublicUrl(photo.image_path).data.publicUrl }} style={styles.reviewImage} accessibilityLabel="후기 첨부사진" />)}</View> : null}
              <View style={styles.reviewFooter}><Text style={styles.linkText}>{review.storeName}</Text><Ionicons name="chevron-forward" size={18} color={theme.primary} /></View>
            </TouchableOpacity>)}
        </View> : null}

        <View style={styles.mapSection}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>내 주변 부품·철물점 찾기</Text><TouchableOpacity style={styles.textButton} accessibilityRole="button" onPress={() => navigate('/explore?tab=map' as Href)}><Text style={styles.linkText}>지도 보기</Text></TouchableOpacity></View>
          <Text style={styles.muted}>직접 고치고 싶다면? 가까운 가게와 필요한 부품을 찾아보세요.</Text>
          {location && Platform.OS !== 'web' ? <InlineMap latitude={location.latitude} longitude={location.longitude} onPress={() => navigate('/explore?tab=map' as Href)} />
            : <TouchableOpacity style={styles.mapLink} accessibilityRole="button" accessibilityLabel="주변 가게 지도 열기" onPress={() => navigate('/explore?tab=map' as Href)}><Ionicons name="map-outline" size={42} color={theme.primary} /><Text style={styles.rowText}>우리 동네 가게를 지도에서</Text><Ionicons name="arrow-forward" size={20} color={theme.primary} /></TouchableOpacity>}
        </View>
        <View style={styles.safety}>
          <View style={styles.safetyIcon}><Ionicons name="shield-checkmark-outline" size={26} color={theme.primary} /></View>
          <View style={styles.flex}><Text style={styles.rowText}>수리 전, 충분히 상담하세요</Text><Text style={styles.muted}>방문 일정과 작업 범위, 비용을 가게와 먼저 확인해 주세요.</Text></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: AsPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingBottom: 28, gap: 20 },
    flex: { flex: 1, minWidth: 0, gap: 4 },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    greeting: { paddingHorizontal: 20, paddingTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    greetingTitle: { fontSize: 22, lineHeight: 31, fontWeight: '700', color: theme.text, letterSpacing: 0 },
    greetingLogo: { width: 54, height: 54, borderRadius: 8 },
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.positive },
    hero: { backgroundColor: theme.action, padding: 24, gap: 12, borderRadius: 8, marginHorizontal: 20 },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroEyebrow: { fontSize: 12, color: '#fff', fontWeight: '600' },
    heroTitle: { fontSize: 26, lineHeight: 36, color: '#fff', fontWeight: '800', letterSpacing: 0 },
    heroDescription: { color: '#dce1ff', fontSize: 13, lineHeight: 21 },
    primaryButton: { minHeight: 56, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, backgroundColor: '#e5630c', marginTop: 4 },
    primaryText: { fontSize: 19, lineHeight: 26, fontWeight: '800', color: '#fff', flexShrink: 1 },
    shortcuts: { flexDirection: 'row', paddingHorizontal: 20, gap: 10 },
    shortcut: { flex: 1, minWidth: 0, minHeight: 130, padding: 12, gap: 6, backgroundColor: theme.surface, borderRadius: 8, boxShadow: '0px 2px 8px rgba(30,41,59,0.06)' },
    shortcutIcon: { width: 38, height: 38, borderRadius: 8, backgroundColor: theme.primarySoft, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    shortcutText: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: theme.text },
    shortcutDetail: { fontSize: 11, lineHeight: 17, color: theme.textMuted },
    emergency: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 10, backgroundColor: theme.accentSoft, alignItems: 'center' },
    emergencyIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    emergencyTitle: { fontSize: 17, lineHeight: 24, color: theme.accentText, fontWeight: '700' },
    emergencyDescription: { fontSize: 12, lineHeight: 19, color: theme.accentText },
    section: { paddingHorizontal: 20, gap: 14 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
    sectionTitle: { fontSize: 19, lineHeight: 28, fontWeight: '700', color: theme.text, flexShrink: 1 },
    textButton: { minHeight: 44, justifyContent: 'center' },
    linkText: { color: theme.primary, fontSize: 13, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
    categoryGrid: { gap: 10 },
    categoryRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
    category: { flex: 1, minWidth: 0, minHeight: 134, paddingHorizontal: 4, paddingVertical: 14, alignItems: 'center', gap: 5, borderRadius: 8, backgroundColor: theme.surface, boxShadow: '0px 2px 8px rgba(30,41,59,0.06)' },
    categoryIcon: { width: 48, height: 48, borderRadius: 8, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    categoryTitle: { fontSize: 13, lineHeight: 20, color: theme.text, fontWeight: '700', textAlign: 'center' },
    categoryDetail: { fontSize: 11, lineHeight: 17, color: theme.textMuted, textAlign: 'center' },
    rowText: { fontSize: 15, lineHeight: 23, fontWeight: '600', color: theme.text },
    muted: { fontSize: 12, lineHeight: 19, color: theme.textMuted, flexShrink: 1 },
    emptyReview: { paddingVertical: 26, gap: 10, alignItems: 'center' },
    review: { borderRadius: 8, backgroundColor: theme.surface, padding: 16, gap: 12, boxShadow: '0px 2px 8px rgba(30,41,59,0.06)' },
    reviewAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primarySoft },
    reviewSentiment: { color: theme.accentText, fontSize: 12, fontWeight: '700' },
    reviewBody: { fontSize: 14, lineHeight: 23, color: theme.text },
    reviewImages: { flexDirection: 'row', gap: 8 },
    reviewImage: { flex: 1, height: 120, borderRadius: 8, backgroundColor: theme.surfaceSoft },
    reviewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    mapSection: { padding: 20, backgroundColor: theme.surfaceMuted, gap: 12 },
    mapLink: { minHeight: 144, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.surfaceSoft },
    safety: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
    safetyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },
  });
}
