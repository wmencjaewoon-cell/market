import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../hooks/use-app-theme';
import type { AsGuide } from '../../lib/asAnalysis';
import { supabase } from '../../lib/supabase';

const fields = [
  ['tools', '준비물'], ['steps', '작업 절차'], ['warnings', '주의사항'], ['stop_conditions', '작업 중단 조건'],
] as const;
type Editor = { title: string; applicability: string; tools: string; steps: string; warnings: string; stop_conditions: string };
const editorFor = (guide: AsGuide): Editor => ({
  title: guide.title, applicability: guide.applicability, tools: guide.tools.join('\n'),
  steps: guide.steps.join('\n'), warnings: guide.warnings.join('\n'), stop_conditions: guide.stop_conditions.join('\n'),
});

export default function AsGuidesScreen() {
  const { user } = useAuth();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { padding: 20, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: insets.bottom + 32 },
    title: { color: theme.text, fontSize: 19, fontWeight: '700', lineHeight: 28 },
    label: { color: theme.text, fontSize: 14, fontWeight: '700', lineHeight: 22 },
    text: { color: theme.textMuted, fontSize: 14, lineHeight: 23 },
    error: { color: theme.danger, fontSize: 14, lineHeight: 23 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 10 },
    entry: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 6 },
    input: { color: theme.text, backgroundColor: theme.input, borderWidth: 1, borderColor: theme.border, borderRadius: 6, padding: 12, fontSize: 15, lineHeight: 24, minHeight: 48 },
    area: { minHeight: 128, textAlignVertical: 'top' },
    button: { padding: 12, minHeight: 48, borderRadius: 6, backgroundColor: theme.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    buttonText: { color: theme.primaryText, fontSize: 15, fontWeight: '700' },
  }), [theme, insets.bottom]);
  const [guides, setGuides] = useState<AsGuide[]>([]);
  const [selected, setSelected] = useState<AsGuide | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setAuthorized(false); setGuides([]); setSelected(null); setEditor(null); setMessage('');
    try {
      if (!user) throw new Error('관리자 계정으로 로그인해 주세요.');
      const { data: profile, error: profileError } = await supabase.from('profiles').select('role,status').eq('id', user.id).single();
      if (profileError || profile?.role !== 'admin' || profile.status === 'blocked') throw new Error('관리자만 가이드를 검수할 수 있습니다.');
      const { data, error } = await supabase.from('as_repair_guides').select('*').order('key');
      if (error) throw new Error('가이드를 불러오지 못했습니다. AI 분석 SQL 적용 여부를 확인해 주세요.');
      if (version !== generation.current) return;
      setAuthorized(true); setGuides(data as AsGuide[]);
    } catch (error) { if (version === generation.current) setMessage((error as Error).message); }
    finally { if (version === generation.current) setLoading(false); }
  }, [user]);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);
  const change = (field: keyof Editor, value: string) => { setEditor(previous => previous ? { ...previous, [field]: value } : null); setReviewed(false); };
  const save = async (publish: boolean) => {
    if (!editor || !selected || lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    const version = generation.current;
    try {
      const content = { ...editor, ...Object.fromEntries(fields.map(([key]) => [key, editor[key].split('\n').map(value => value.trim()).filter(Boolean)])) };
      const { data, error } = await supabase.rpc('save_as_repair_guide', { p_key: selected.key, p_content: content, p_publish: publish, p_review_confirmed: reviewed });
      if (error) throw error;
      if (version !== generation.current) return;
      const guide = data as AsGuide;
      setGuides(previous => previous.map(item => item.key === guide.key ? guide : item));
      setSelected(guide); setEditor(editorFor(guide)); setReviewed(false);
      setMessage(publish ? '검수된 가이드를 게시했습니다.' : '초안으로 저장했습니다. 사용자에게 수리 절차가 표시되지 않습니다.');
    } catch (error) { if (version === generation.current) setMessage((error as Error).message); }
    finally { lock.current = false; if (version === generation.current) setBusy(false); }
  };
  return <View style={styles.screen}>
    <Stack.Screen options={{ title: 'AI 셀프 가이드 검수', headerShown: true, headerTitleAlign: 'center' }} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Text style={styles.title}>셀프 수리 가이드</Text>
      {loading ? <ActivityIndicator color={theme.primary} /> : null}
      {!loading && !authorized ? <TouchableOpacity style={styles.row} accessibilityRole="button" onPress={() => void load()}><Ionicons name="refresh-outline" size={20} color={theme.primary} /><Text style={styles.label}>다시 확인</Text></TouchableOpacity> : null}
      {authorized ? <>
        <Text style={styles.text}>실제 작업에 대한 전문 검토 후 게시하세요. 전기·가스 등 위험 작업은 등록 대상이 아닙니다. 절차가 바뀌면 다시 검수해야 합니다.</Text>
        {guides.map(guide => <TouchableOpacity key={guide.key} style={styles.entry} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: selected?.key === guide.key }} onPress={() => { setSelected(guide); setEditor(editorFor(guide)); setReviewed(false); setMessage(''); }}>
          <Text style={styles.label}>{guide.title}</Text><Text style={styles.text}>{guide.status === 'published' ? '게시 중' : '검수 전 초안'}</Text>
        </TouchableOpacity>)}
        {editor ? <View style={{ gap: 12 }}>
          <Text style={styles.label}>제목</Text>
          <TextInput style={styles.input} accessibilityLabel="가이드 제목" value={editor.title} maxLength={100} editable={!busy} onChangeText={value => change('title', value)} />
          <Text style={styles.label}>적용 범위 · 제외 조건</Text>
          <TextInput style={[styles.input, styles.area]} accessibilityLabel="가이드 적용 범위" value={editor.applicability} maxLength={1500} multiline editable={!busy} onChangeText={value => change('applicability', value)} />
          {fields.map(([key, label]) => <View key={key} style={{ gap: 8 }}><Text style={styles.label}>{label} (항목별 줄바꿈)</Text><TextInput style={[styles.input, styles.area]} accessibilityLabel={label} value={editor[key]} maxLength={10000} multiline editable={!busy} onChangeText={value => change(key, value)} /></View>)}
          <TouchableOpacity style={styles.row} disabled={busy} accessibilityRole="checkbox" accessibilityLabel="가이드 안전 검수 완료" accessibilityState={{ checked: reviewed }} onPress={() => setReviewed(value => !value)}><Ionicons name={reviewed ? 'checkbox' : 'square-outline'} size={23} color={theme.primary} /><Text style={[styles.text, { flex: 1 }]}>적용 범위, 절차, 주의사항과 작업 중단 조건을 검토했습니다.</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.button, !reviewed && { opacity: 0.5 }]} disabled={busy || !reviewed} accessibilityRole="button" accessibilityLabel="검수 완료 후 게시" accessibilityState={{ disabled: busy || !reviewed }} onPress={() => void save(true)}><Ionicons name="checkmark-circle-outline" size={20} color={theme.primaryText} /><Text style={styles.buttonText}>{busy ? '저장 중...' : '검수 완료 후 게시'}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.button, { backgroundColor: theme.surfaceMuted }]} disabled={busy} accessibilityRole="button" onPress={() => void save(false)}><Ionicons name="save-outline" size={20} color={theme.text} /><Text style={[styles.buttonText, { color: theme.text }]}>{selected?.status === 'published' ? '게시 중지하고 초안 저장' : '초안 저장'}</Text></TouchableOpacity>
        </View> : null}
      </> : null}
      {message ? <Text style={styles.text} accessibilityRole="alert">{message}</Text> : null}
    </ScrollView>
  </View>;
}
