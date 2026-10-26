import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { type AsPalette } from '../lib/asAppearance';
import { type AsHomeVisit } from '../lib/asHomeVisits';

type Props = {
  theme: AsPalette;
  loggedIn: boolean;
  loading: boolean;
  failed: boolean;
  visits: AsHomeVisit[];
  onRetry: () => void;
  navigate: (href: Href) => void;
};

export default function AsHomeVisitSection({ theme, loggedIn, loading, failed, visits, onRetry, navigate }: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const callInFlight = useRef(false);
  const index = Math.max(0, visits.findIndex(visit => visit.roomId === selectedRoomId));
  const visit = visits[index];
  const ready = loggedIn && !loading && !failed && visit;

  const callStore = async () => {
    if (!ready || !visit.storePhone || callInFlight.current) return;
    callInFlight.current = true;
    setCalling(true);
    try {
      await Linking.openURL(`tel:${visit.storePhone}`);
    } catch {
      const message = '전화 앱을 열지 못했습니다. 채팅으로 가게에 연락해 주세요.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('전화 연결 실패', message);
    } finally {
      callInFlight.current = false;
      setCalling(false);
    }
  };

  return <View style={styles.section} testID="as-home-visits">
    <View style={styles.header}>
      <View style={styles.icon}><Ionicons name="notifications-outline" size={21} color="#fff" /></View>
      <View style={styles.flex}>
        <Text style={styles.label}>{ready ? '방문 예약 진행중' : '방문 예약'}</Text>
        {ready ? <Text style={styles.date}>{new Date(visit.appointmentAt).toLocaleString('ko-KR', {
          month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit',
        })}</Text> : null}
      </View>
      {ready && visits.length > 1 ? <View style={styles.pager}>
        <TouchableOpacity style={styles.pagerButton} accessibilityRole="button" accessibilityLabel="이전 방문 일정" disabled={index === 0} accessibilityState={{ disabled: index === 0 }} onPress={() => setSelectedRoomId(visits[index - 1].roomId)}>
          <Ionicons name="chevron-back" size={18} color={index === 0 ? theme.textMuted : theme.primary} />
        </TouchableOpacity>
        <Text style={styles.count}>{index + 1}/{visits.length}</Text>
        <TouchableOpacity style={styles.pagerButton} accessibilityRole="button" accessibilityLabel="다음 방문 일정" disabled={index === visits.length - 1} accessibilityState={{ disabled: index === visits.length - 1 }} onPress={() => setSelectedRoomId(visits[index + 1].roomId)}>
          <Ionicons name="chevron-forward" size={18} color={index === visits.length - 1 ? theme.textMuted : theme.primary} />
        </TouchableOpacity>
      </View> : null}
    </View>
    {!loggedIn ? <>
      <Text style={styles.title}>로그인하고 방문 일정을 확인하세요</Text>
      <TouchableOpacity style={styles.primary} accessibilityRole="button" onPress={() => navigate('/login?redirect=/home' as Href)}><Text style={styles.primaryText}>로그인</Text></TouchableOpacity>
    </> : loading ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /><Text style={styles.muted}>방문 일정 확인 중...</Text></View>
      : failed ? <>
        <Text style={styles.title}>방문 일정을 불러오지 못했어요</Text>
        <TouchableOpacity style={styles.secondary} accessibilityRole="button" accessibilityLabel="방문 일정 다시 불러오기" onPress={onRetry}><Ionicons name="refresh" size={18} color={theme.primary} /><Text style={styles.secondaryText}>다시 시도</Text></TouchableOpacity>
      </> : visit ? <>
        <Text style={styles.title}>{visit.title}</Text>
        <View style={styles.statusRow}><Text style={styles.status}>일정 제안</Text><Text style={styles.muted}>{visit.storeName}</Text></View>
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.secondary, (!visit.storePhone || calling) && styles.disabled]} accessibilityRole="button" accessibilityLabel={visit.storePhone ? `${visit.storeName} 전화 연결` : '연락처 미등록'} accessibilityState={{ disabled: !visit.storePhone || calling }} disabled={!visit.storePhone || calling} onPress={() => void callStore()}>
            <Ionicons name="call-outline" size={18} color={theme.primary} /><Text style={styles.secondaryText}>{visit.storePhone ? '전화 연결' : '연락처 미등록'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primary} accessibilityRole="button" accessibilityLabel={`${visit.title} 실시간 상담`} onPress={() => navigate({ pathname: '/chat/[roomId]', params: { roomId: visit.roomId } })}>
            <Ionicons name="chatbubble-outline" size={18} color="#fff" /><Text style={styles.primaryText}>실시간 상담</Text>
          </TouchableOpacity>
        </View>
      </> : <>
        <Text style={styles.title}>등록된 방문 약속이 없어요</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondary} accessibilityRole="button" onPress={() => navigate('/my/inquiries' as Href)}><Ionicons name="document-text-outline" size={18} color={theme.primary} /><Text style={styles.secondaryText}>문의 내역</Text></TouchableOpacity>
          <TouchableOpacity style={styles.primary} accessibilityRole="button" onPress={() => navigate('/(tabs)/chat')}><Ionicons name="chatbubble-outline" size={18} color="#fff" /><Text style={styles.primaryText}>채팅 확인</Text></TouchableOpacity>
        </View>
      </>}
  </View>;
}

function createStyles(theme: AsPalette) {
  return StyleSheet.create({
    section: { padding: 20, gap: 12, backgroundColor: theme.surfaceSoft },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    flex: { flex: 1, minWidth: 130, gap: 3 },
    icon: { width: 38, height: 38, borderRadius: 8, backgroundColor: theme.action, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 13, lineHeight: 20, fontWeight: '700', color: theme.primary },
    date: { fontSize: 12, lineHeight: 19, color: theme.text },
    title: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: theme.text },
    statusRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    status: { color: theme.primary, fontSize: 12, lineHeight: 19, fontWeight: '600' },
    muted: { fontSize: 12, lineHeight: 19, color: theme.textMuted, flexShrink: 1 },
    loading: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
    actions: { flexDirection: 'row', gap: 8 },
    secondary: { flexGrow: 1, flexBasis: 0, minHeight: 44, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8, backgroundColor: theme.surface },
    primary: { flexGrow: 1, flexBasis: 0, minHeight: 44, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8, backgroundColor: theme.action },
    primaryText: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: '#fff', flexShrink: 1 },
    secondaryText: { color: theme.primary, fontSize: 13, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
    disabled: { opacity: 0.5 },
    pager: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
    pagerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    count: { fontSize: 12, color: theme.text, minWidth: 28, textAlign: 'center' },
  });
}
