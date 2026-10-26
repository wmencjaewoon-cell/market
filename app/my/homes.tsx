import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../hooks/use-app-theme';
import { deleteUserHome, fetchUserHomes, formatHomeAddress, formatHomeSummary, setDefaultUserHome, type UserHome } from '../../lib/userHomes';

export default function MyHomesScreen() {
  const { user } = useAuth();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { padding: 20, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 720, alignSelf: 'center', gap: 16 },
    intro: { color: theme.textMuted, fontSize: 14, lineHeight: 22 },
    card: { padding: 18, borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, gap: 8 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { flex: 1, color: theme.text, fontSize: 19, fontWeight: '800' },
    badge: { color: theme.primary, backgroundColor: theme.primarySoft, fontWeight: '800', fontSize: 12, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
    text: { color: theme.textMuted, fontSize: 14, lineHeight: 22 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    action: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: theme.text, fontWeight: '700' },
    dangerText: { color: theme.danger, fontWeight: '700' },
    add: { minHeight: 54, borderRadius: 14, backgroundColor: theme.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 14 },
    addText: { color: theme.primaryText, fontSize: 16, fontWeight: '800' },
    empty: { padding: 28, alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: theme.surface },
    error: { color: theme.danger, lineHeight: 22 },
  }), [insets.bottom, theme]);
  const [homes, setHomes] = useState<UserHome[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true); setError('');
    try { setHomes(await fetchUserHomes()); }
    catch { setError('등록한 집을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const makeDefault = async (id: string) => {
    setBusy(true); setError('');
    try { await setDefaultUserHome(id); await load(); }
    catch { setError('기본 집을 변경하지 못했습니다.'); setBusy(false); }
  };

  const remove = async (home: UserHome) => {
    const perform = async () => {
      setBusy(true); setError('');
      try { await deleteUserHome(home.id); await load(); }
      catch { setError('집을 삭제하지 못했습니다.'); setBusy(false); }
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${home.name}을(를) 삭제할까요?`)) await perform();
      return;
    }
    Alert.alert('집 삭제', `${home.name}을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void perform() },
    ]);
  };

  if (!user) return <View style={styles.content}><Text style={styles.intro}>로그인 후 내 집을 관리할 수 있어요.</Text></View>;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.intro}>A/S 받을 장소를 미리 등록하면 건물 정보가 분석에 반영되고 주변 업체를 찾을 수 있어요. 상세주소와 좌표는 AI 모델에 전달하지 않습니다.</Text>
    {error ? <TouchableOpacity onPress={() => void load()}><Text style={styles.error}>{error} 다시 불러오기</Text></TouchableOpacity> : null}
    {busy && !homes.length ? <ActivityIndicator color={theme.primary} /> : null}
    {!busy && !homes.length ? <View style={styles.empty}>
      <Ionicons name="home-outline" size={38} color={theme.textMuted} />
      <Text style={styles.name}>등록된 집이 없습니다</Text>
      <Text style={[styles.text, { textAlign: 'center' }]}>우리집, 부모님집처럼 여러 장소를 등록할 수 있어요.</Text>
    </View> : null}
    {homes.map(home => <View key={home.id} style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.name}>{home.name}</Text>
        {home.is_default ? <Text style={styles.badge}>기본 집</Text> : null}
      </View>
      <Text style={styles.text}>{formatHomeAddress(home) || '주소 미등록'}</Text>
      {formatHomeSummary(home) ? <Text style={styles.text}>{formatHomeSummary(home)}</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={() => router.push({ pathname: '/my/home-edit' as any, params: { id: home.id } })}><Text style={styles.actionText}>수정</Text></TouchableOpacity>
        {!home.is_default ? <TouchableOpacity style={styles.action} disabled={busy} onPress={() => void makeDefault(home.id)}><Text style={styles.actionText}>기본 집 설정</Text></TouchableOpacity> : null}
        <TouchableOpacity style={styles.action} disabled={busy} onPress={() => void remove(home)}><Text style={styles.dangerText}>삭제</Text></TouchableOpacity>
      </View>
    </View>)}
    <TouchableOpacity style={styles.add} onPress={() => router.push('/my/home-edit' as any)}>
      <Ionicons name="add-circle-outline" size={22} color={theme.primaryText} />
      <Text style={styles.addText}>집 추가</Text>
    </TouchableOpacity>
  </ScrollView>;
}
