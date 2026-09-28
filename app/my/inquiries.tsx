// 신청자 본인의 문의 원본을 조회한다. 업체용 견적서와 내부 상담 메모는 포함하지 않는다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import VideoAttachment from '../../components/VideoAttachment';
import { type AppPalette } from '../../contexts/theme';
import { useAppTheme } from '../../hooks/use-app-theme';
import { isVideoAttachment } from '../../lib/mediaAttachments';
import { supabase } from '../../lib/supabase';

const PAGE_SIZE = 20;

type Inquiry = {
  id: number;
  title: string;
  category: string;
  description: string;
  region: string | null;
  address: string | null;
  applicant_name: string | null;
  applicant_phone: string | null;
  desired_date: string | null;
  preferred_contact: string | null;
  budget: string | null;
  created_at: string;
  estimate_request_images: {
    id: number;
    image_path: string;
    sort_order: number | null;
  }[];
};

type LoadMode = 'initial' | 'refresh' | 'more';

function InquiryImage({ path }: { path: string }) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [failed, setFailed] = useState(false);
  const url = supabase.storage.from('estimate-images').getPublicUrl(path).data.publicUrl;

  if (isVideoAttachment(path)) return <VideoAttachment uri={url} name="문의 첨부영상" />;

  if (failed) {
    return (
      <TouchableOpacity
        style={styles.imageError}
        accessibilityRole="button"
        accessibilityLabel="첨부사진 다시 불러오기"
        onPress={() => setFailed(false)}
      >
        <Ionicons name="refresh-outline" size={22} color={theme.textMuted} />
        <Text style={styles.muted}>사진 다시 불러오기</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={styles.image}
      resizeMode="contain"
      accessibilityLabel="문의 첨부사진"
      onError={() => setFailed(true)}
    />
  );
}

export default function MyInquiriesScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [result, setResult] = useState<{ userId: string; items: Inquiry[] } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadMode, setLoadMode] = useState<LoadMode | null>('initial');
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const nextOffset = useRef(0);
  const loadingRef = useRef(false);
  const loadVersion = useRef(0);
  const items = result?.userId === userId ? result?.items ?? [] : [];

  const loadInquiries = useCallback(async (mode: LoadMode) => {
    if (!userId || (loadingRef.current && mode !== 'initial')) return;

    const version = ++loadVersion.current;
    const offset = mode === 'more' ? nextOffset.current : 0;
    loadingRef.current = true;
    setLoadMode(mode);
    setError('');
    if (mode === 'initial') {
      setResult(null);
      setExpandedId(null);
      setHasMore(false);
    }

    try {
      const { data, error: queryError } = await supabase
        .from('estimate_requests')
        .select(`
          id, title, category, description, region, address,
          applicant_name, applicant_phone, desired_date, preferred_contact,
          budget, created_at,
          estimate_request_images (id, image_path, sort_order)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + PAGE_SIZE);

      if (queryError) throw queryError;
      // 1건을 더 조회해 다음 페이지 유무를 판단한다. 계정 변경/화면 이탈 후의 응답은 무시한다.
      if (version !== loadVersion.current) return;
      const rows = (data ?? []) as Inquiry[];
      const page = rows.slice(0, PAGE_SIZE).map((item) => ({
        ...item,
        estimate_request_images: [...(item.estimate_request_images ?? [])]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }));
      setResult((previous) => {
        const previousItems = mode === 'more' && previous?.userId === userId
          ? previous.items
          : [];
        const previousIds = new Set(previousItems.map((item) => item.id));
        return {
          userId,
          items: [...previousItems, ...page.filter((item) => !previousIds.has(item.id))],
        };
      });
      nextOffset.current = offset + page.length;
      setHasMore(rows.length > PAGE_SIZE);
    } catch {
      if (version === loadVersion.current) {
        setError('문의 내역을 불러오지 못했습니다. 다시 시도해 주세요.');
      }
    } finally {
      if (version === loadVersion.current) {
        loadingRef.current = false;
        setLoadMode(null);
      }
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (userId) {
      void loadInquiries('initial');
    } else {
      setResult(null);
      setLoadMode(null);
      setError('');
    }

    return () => {
      loadVersion.current += 1;
      loadingRef.current = false;
    };
  }, [loadInquiries, userId]));

  if (!userId) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={34} color={theme.textMuted} />
        <Text style={styles.stateTitle}>로그인 후 문의 내역을 볼 수 있어요</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          accessibilityRole="button"
          onPress={() => router.push('/login?redirect=/my/inquiries' as any)}
        >
          <Text style={styles.primaryButtonText}>로그인</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadMode === 'initial') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.muted}>문의 내역을 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
      data={items}
      keyExtractor={(item) => String(item.id)}
      extraData={expandedId}
      refreshControl={
        <RefreshControl
          refreshing={loadMode === 'refresh'}
          onRefresh={() => void loadInquiries('refresh')}
          tintColor={theme.primary}
          colors={[theme.primary]}
        />
      }
      ListHeaderComponent={error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.textButton}
            accessibilityRole="button"
            disabled={loadMode !== null}
            onPress={() => void loadInquiries('refresh')}
          >
            <Ionicons name="refresh-outline" size={18} color={theme.primary} />
            <Text style={styles.buttonText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      ListEmptyComponent={!error ? (
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={38} color={theme.textMuted} />
          <Text style={styles.stateTitle}>아직 남긴 문의가 없어요</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            accessibilityRole="button"
            onPress={() => router.push('/estimate/create' as any)}
          >
            <Ionicons name="create-outline" size={19} color={theme.primaryText} />
            <Text style={styles.primaryButtonText}>문의하기</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      renderItem={({ item }) => {
        const expanded = expandedId === item.id;
        const fields = [
          ['신청자', item.applicant_name],
          ['전화번호', item.applicant_phone],
          ['연락 방법', item.preferred_contact],
          ['지역', item.region],
          ['주소', item.address],
          ['희망 일정', item.desired_date],
          ['희망 예산', item.budget],
        ];

        return (
          <View style={styles.inquiry}>
            <TouchableOpacity
              style={styles.inquiryHeader}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpandedId(expanded ? null : item.id)}
            >
              <View style={styles.summary}>
                <Text style={styles.muted}>
                  {new Date(item.created_at).toLocaleDateString('ko-KR')}
                </Text>
                <Text style={styles.inquiryTitle} numberOfLines={expanded ? undefined : 2}>
                  {item.title}
                </Text>
                <Text style={styles.muted} numberOfLines={expanded ? undefined : 2}>
                  {[item.category, item.region].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.textMuted}
              />
            </TouchableOpacity>

            {expanded ? (
              <View style={styles.details}>
                <Text style={styles.sectionTitle}>문의 내용</Text>
                <Text style={styles.description} selectable>{item.description}</Text>
                {fields.filter(([, value]) => value).map(([label, value]) => (
                  <View key={label} style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <Text style={styles.fieldValue} selectable>{value}</Text>
                  </View>
                ))}
                {item.estimate_request_images.length > 0 ? (
                  <View style={styles.photos}>
                    <Text style={styles.sectionTitle}>첨부 사진·영상</Text>
                    {item.estimate_request_images.map((photo) => (
                      <InquiryImage key={photo.id} path={photo.image_path} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      }}
      ListFooterComponent={hasMore ? (
        <TouchableOpacity
          style={styles.moreButton}
          accessibilityRole="button"
          disabled={loadMode !== null}
          onPress={() => void loadInquiries('more')}
        >
          {loadMode === 'more'
            ? <ActivityIndicator color={theme.primary} />
            : <Ionicons name="chevron-down" size={20} color={theme.primary} />}
          <Text style={styles.buttonText}>이전 문의 더 보기</Text>
        </TouchableOpacity>
      ) : null}
    />
  );
}

function createStyles(theme: AppPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    list: { flexGrow: 1, paddingHorizontal: 20 },
    center: {
      flex: 1, padding: 24, gap: 16, alignItems: 'center',
      justifyContent: 'center', backgroundColor: theme.background,
    },
    empty: { flex: 1, paddingVertical: 64, gap: 16, alignItems: 'center' },
    stateTitle: { color: theme.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
    muted: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    primaryButton: {
      minHeight: 46, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8,
      backgroundColor: theme.primary, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    primaryButtonText: { color: theme.primaryText, fontSize: 15, fontWeight: '700' },
    inquiry: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    inquiryHeader: { paddingVertical: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
    summary: { flex: 1, minWidth: 0, gap: 5 },
    inquiryTitle: { color: theme.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
    details: { paddingBottom: 24, gap: 12 },
    sectionTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    description: { color: theme.text, fontSize: 15, lineHeight: 24, marginBottom: 8 },
    fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    fieldLabel: { width: 76, color: theme.textMuted, fontSize: 13, lineHeight: 21 },
    fieldValue: { flex: 1, color: theme.text, fontSize: 14, lineHeight: 21 },
    photos: { marginTop: 8, gap: 12 },
    image: { width: '100%', aspectRatio: 4 / 3, backgroundColor: theme.surfaceMuted, borderRadius: 8 },
    imageError: {
      minHeight: 120, backgroundColor: theme.surfaceMuted,
      alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8,
    },
    errorBox: { paddingVertical: 20, gap: 8 },
    errorText: { color: theme.danger, fontSize: 14, lineHeight: 22 },
    textButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
    buttonText: { color: theme.primary, fontSize: 14, fontWeight: '700' },
    moreButton: {
      minHeight: 52, marginTop: 12, padding: 12,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
  });
}
