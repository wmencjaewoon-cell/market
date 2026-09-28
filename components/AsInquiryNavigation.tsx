import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Keyboard, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/use-app-theme';
import { getAsPalette } from '../lib/asAppearance';

const items = [
  { title: '홈', icon: 'home-outline', route: '/(tabs)/home' },
  { title: 'AS문의', icon: 'construct-outline', route: null },
  { title: '채팅', icon: 'chatbubble-ellipses-outline', route: '/(tabs)/chat' },
  { title: '내정보', icon: 'person-outline', route: '/(tabs)/my' },
] as const;

// 기존 /estimate/create 딥링크도 같은 하단 이동을 제공한다. 탭 안에서는 실제 Tabs만 사용한다.
export default function AsInquiryNavigation() {
  const insets = useSafeAreaInsets();
  const theme = getAsPalette(useAppTheme());
  return <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.background, borderTopColor: theme.border }]}>
    {items.map((item) => <TouchableOpacity key={item.title} style={styles.item} accessibilityRole="tab" accessibilityLabel={item.title} accessibilityState={{ selected: !item.route }} aria-selected={!item.route} onPress={() => {
      if (!item.route) return;
      Keyboard.dismiss();
      router.dismissTo(item.route);
    }}>
      <Ionicons name={item.icon} size={24} color={item.route ? theme.textMuted : theme.primary} />
      <Text style={[styles.label, { color: item.route ? theme.textMuted : theme.primary }]}>{item.title}</Text>
    </TouchableOpacity>)}
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 11, fontWeight: '700' },
});
