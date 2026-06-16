import { router } from 'expo-router';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../../../contexts/AuthContext';
import { canCreateListing } from '../../../../lib/guard';

function showCreateAlert(title: string, message = '') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
}

export default function CreateIndexScreen() {
  const { user } = useAuth();

  const openCreateScreen = async (pathname: string) => {
    if (!user) {
      router.push(`/login?redirect=${pathname}` as any);
      return;
    }

    const guard = await canCreateListing();

    if (!guard.ok) {
      showCreateAlert('게시글 등록 제한', guard.reason || '게시글 등록이 제한되어 있습니다.');
      return;
    }

    router.push(pathname as any);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>무엇을 등록할까요?</Text>

      <TouchableOpacity style={styles.card} onPress={() => openCreateScreen('/(tabs)/home/create/sell')}>
        <Text style={styles.cardTitle}>판매 등록</Text>
        <Text style={styles.cardDesc}>가게 상품이나 개인 거래 물품</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => openCreateScreen('/(tabs)/home/create/share')}>
        <Text style={styles.cardTitle}>나눔 등록</Text>
        <Text style={styles.cardDesc}>남는 자재나 공구 무료 나눔</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => openCreateScreen('/(tabs)/home/create/want')}>
        <Text style={styles.cardTitle}>구함 등록</Text>
        <Text style={styles.cardDesc}>급하게 필요한 자재/공구 요청</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', padding: 16, gap: 14 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 18,
    padding: 16,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  cardDesc: { color: '#6b7280' },
});
