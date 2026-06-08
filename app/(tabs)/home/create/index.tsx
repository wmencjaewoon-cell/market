import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function CreateIndexScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>무엇을 등록할까요?</Text>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/(tabs)/home/create/sell')}>
        <Text style={styles.cardTitle}>판매 등록</Text>
        <Text style={styles.cardDesc}>가게 상품이나 개인 거래 물품</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/(tabs)/home/create/share')}>
        <Text style={styles.cardTitle}>나눔 등록</Text>
        <Text style={styles.cardDesc}>남는 자재나 공구 무료 나눔</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/(tabs)/home/create/want')}>
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