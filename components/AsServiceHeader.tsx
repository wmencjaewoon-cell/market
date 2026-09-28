import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useAppTheme } from '../hooks/use-app-theme';
import { SIMPLE_AS_SERVICE_NAME } from '../lib/appMode';
import { getAsPalette, type AsPalette } from '../lib/asAppearance';
import { getUnreadNotificationCount } from '../lib/notificationsData';
import { fetchMyRegions, fetchMyRegionSettings } from '../lib/region';

export default function AsServiceHeader({ back = false }: { back?: boolean }) {
  const { user } = useAuth();
  const base = useAppTheme();
  const theme = useMemo(() => getAsPalette(base), [base]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [regionName, setRegionName] = useState('동네 설정');
  const [unread, setUnread] = useState(0);
  const navigating = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    navigating.current = false;
    setUnread(0);
    setRegionName('동네 설정');
    void Promise.allSettled([
      user?.id ? getUnreadNotificationCount() : Promise.resolve(0),
      Promise.all([fetchMyRegions(), fetchMyRegionSettings()]),
    ]).then(([notification, location]) => {
      if (!active) return;
      if (notification.status === 'fulfilled') setUnread(notification.value);
      if (location.status === 'fulfilled') {
        const [regions, settings] = location.value;
        const selected = regions.find((item) => item.id === settings?.active_region_id) || regions[0];
        const parts = selected?.region_name?.trim().split(/\s+/) || [];
        setRegionName([...parts].reverse().find((part: string) => /[읍면동가]$/.test(part)) || parts.at(-1) || '동네 설정');
      }
    });
    return () => { active = false; };
  }, [user?.id]));

  const open = (route: string) => {
    if (navigating.current) return;
    navigating.current = true;
    router.push(route as any);
  };

  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        {back ? <TouchableOpacity style={styles.back} accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home')}>
          <Ionicons name="arrow-back" size={22} color={theme.primary} />
        </TouchableOpacity> : <Image source={require('../assets/images/interior-market.jpg')} style={styles.logo} />}
        <Text style={styles.name}>{SIMPLE_AS_SERVICE_NAME}</Text>
      </View>
      <TouchableOpacity style={styles.location} accessibilityRole="button" accessibilityLabel={`내 동네 설정, ${regionName}`} onPress={() => open('/(tabs)/home/regions')}>
        <Ionicons name="location" size={16} color={theme.primary} />
        <Text style={styles.locationName} numberOfLines={1}>{regionName}</Text>
        <Ionicons name="caret-down" size={11} color={theme.textMuted} />
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`알림${unread ? `, 읽지 않은 알림 ${unread}개` : ''}`} onPress={() => open('/my/notifications')}>
          <Ionicons name="notifications-outline" size={23} color={theme.textMuted} />
          {unread > 0 ? <View style={styles.dot} /> : null}
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} accessibilityRole="button" accessibilityLabel="내정보" onPress={() => open('/(tabs)/my')}>
          <View style={styles.profile}><Ionicons name="person" size={19} color={theme.primary} /></View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(theme: AsPalette) {
  return StyleSheet.create({
    header: { width: '100%', maxWidth: 680, alignSelf: 'center', minHeight: 64, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    logo: { width: 28, height: 28, borderRadius: 8 },
    name: { color: theme.primary, fontSize: 17, lineHeight: 24, fontWeight: '800' },
    back: { width: 28, minHeight: 44, justifyContent: 'center' },
    location: { flex: 1, minWidth: 40, minHeight: 44, maxWidth: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 5, borderRadius: 24, backgroundColor: theme.primarySoft },
    locationName: { color: theme.text, fontSize: 12, fontWeight: '600', flexShrink: 1 },
    actions: { flexDirection: 'row', marginLeft: 'auto' },
    iconButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
    profile: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },
    dot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: theme.accent, right: 8, top: 8 },
  });
}
