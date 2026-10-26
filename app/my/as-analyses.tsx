import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsAnalysisResult from '../../components/AsAnalysisResult';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../hooks/use-app-theme';
import { AS_RESULT_LABELS, type AsAnalysisRecord } from '../../lib/asAnalysis';
import { SHOW_AS_AI_ANALYSIS } from '../../lib/appMode';
import { supabase } from '../../lib/supabase';
import { fetchUserHomes } from '../../lib/userHomes';

export default function MyAsAnalysesScreen() {
  const { user } = useAuth();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { padding: 20, paddingBottom: insets.bottom + 24, width: '100%', maxWidth: 720, alignSelf: 'center', flexGrow: 1 },
    row: { borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 16, gap: 8 },
    title: { color: theme.text, fontSize: 16, fontWeight: '700', lineHeight: 24, flex: 1 },
    text: { color: theme.textMuted, fontSize: 14, lineHeight: 22 },
    button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  }), [theme, insets.bottom]);
  const [rows, setRows] = useState<{ userId: string; items: AsAnalysisRecord[] } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [homeNames, setHomeNames] = useState<Record<string, string>>({});
  const revision = useRef(0);
  const offset = useRef(0);
  const lock = useRef(false);
  const load = useCallback(async (more = false) => {
    if (!user || !SHOW_AS_AI_ANALYSIS || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const version = ++revision.current;
    const start = more ? offset.current : 0;
    const [{ data, error: queryError }, homes] = await Promise.all([
      supabase.from('as_ai_analyses')
        .select('id,status,result,error_message,created_at,input_payload,linked_request_id').eq('user_id', user.id)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(start, start + 20),
      fetchUserHomes().catch(() => []),
    ]);
    if (version !== revision.current) return;
    if (queryError) setError('분석 내역을 불러오지 못했습니다. 다시 시도해 주세요.');
    else {
      setHomeNames(Object.fromEntries(homes.map(home => [home.id, home.name])));
      const page = (data ?? []) as AsAnalysisRecord[];
      setRows(previous => ({ userId: user.id, items: [...(more && previous?.userId === user.id ? previous.items : []), ...page.slice(0, 20)] }));
      offset.current = start + Math.min(page.length, 20); setHasMore(page.length > 20);
    }
    lock.current = false; setBusy(false);
  }, [user]);
  useFocusEffect(useCallback(() => {
    setRows(null); setExpanded(null); setHasMore(false); setBusy(false); lock.current = false;
    void load();
    return () => { revision.current += 1; lock.current = false; };
  }, [load]));
  const items = rows?.userId === user?.id ? rows?.items ?? [] : [];
  if (!SHOW_AS_AI_ANALYSIS) return <View style={styles.content}><Text style={styles.text}>AI 분석은 현재 제공되지 않습니다.</Text></View>;
  if (!user) return <View style={styles.content}><Text style={styles.text}>로그인 후 분석 내역을 확인할 수 있어요.</Text><TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => router.push('/login?redirect=/my/as-analyses' as any)}><Text style={styles.title}>로그인</Text></TouchableOpacity></View>;
  return <FlatList style={styles.screen} contentContainerStyle={styles.content} data={items} keyExtractor={item => item.id}
    refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load()} tintColor={theme.primary} />}
    ListHeaderComponent={error ? <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => void load()}><Text style={styles.text}>{error}</Text><Ionicons name="refresh-outline" size={20} color={theme.primary} /></TouchableOpacity> : null}
    ListEmptyComponent={!busy && !error ? <Text style={styles.text}>아직 분석 내역이 없어요.</Text> : null}
    renderItem={({ item }) => <View style={styles.row}>
      <TouchableOpacity style={styles.button} accessibilityRole="button" accessibilityState={{ expanded: expanded === item.id }} onPress={() => setExpanded(previous => previous === item.id ? null : item.id)}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.text}>{new Date(item.created_at).toLocaleString('ko-KR')}</Text>
          <Text style={styles.title}>{item.result?.issue_area || (item.status === 'failed' ? '분석 실패' : '분석 미완료')}</Text>
          {item.input_payload?.home_id ? <Text style={styles.text}>장소: {homeNames[item.input_payload.home_id] || '삭제된 집'}</Text> : <Text style={styles.text}>장소: 선택 안 함</Text>}
          {item.input_payload?.description ? <Text style={styles.text} numberOfLines={2}>증상: {item.input_payload.description}</Text> : null}
          <Text style={styles.text}>첨부: {item.input_payload?.media?.length ? `사진·영상 ${item.input_payload.media.length}개` : '없음'} · 상담 연결: {item.linked_request_id ? '연결됨' : '연결 안 됨'}</Text>
          <Text style={styles.text}>{item.result ? AS_RESULT_LABELS[item.result.recommended_action] : item.status === 'processing' ? '아직 결과가 저장되지 않았습니다. 잠시 후 새로고침해 주세요.' : '완료된 결과가 없습니다. 작성 중인 문의가 남아 있으면 해당 화면에서 재시도할 수 있습니다.'}</Text>
        </View>
        <Ionicons name={expanded === item.id ? 'chevron-up' : 'chevron-down'} size={20} color={theme.text} />
      </TouchableOpacity>
      {expanded === item.id ? item.result ? <AsAnalysisResult result={item.result} /> : <Text style={styles.text}>{item.error_message || '분석이 완료되지 않았습니다.'}</Text> : null}
    </View>}
    ListFooterComponent={hasMore ? <TouchableOpacity style={styles.button} disabled={busy} accessibilityRole="button" onPress={() => void load(true)}>{busy ? <ActivityIndicator color={theme.primary} /> : <Ionicons name="chevron-down" size={20} color={theme.primary} />}<Text style={styles.title}>이전 분석 더 보기</Text></TouchableOpacity> : null}
  />;
}
