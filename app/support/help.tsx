import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HelpScreen() {
  const handleEmail = () => {
    Linking.openURL('mailto:wmenc.jaewoon@gmail.com');
  };

  const handlePhone = () => {
    Linking.openURL('tel:051-723-0624');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>고객센터</Text>
      <Text style={styles.desc}>
        문의가 필요하시면 아래 방법으로 연락해 주세요.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>이메일 문의</Text>
        <Text style={styles.value}>wmenc.jaewoon@gmail.com</Text>
        <TouchableOpacity style={styles.btn} onPress={handleEmail}>
          <Text style={styles.btnText}>이메일 보내기</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>전화 문의</Text>
        <Text style={styles.value}>051-723-0624</Text>
        <TouchableOpacity style={styles.btn} onPress={handlePhone}>
          <Text style={styles.btnText}>전화 걸기</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>운영시간</Text>
        <Text style={styles.value}>평일 09:00 ~ 18:00</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  desc: { color: '#6b7280', marginBottom: 20, lineHeight: 22 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  label: { fontSize: 14, color: '#6b7280', marginBottom: 6 },
  value: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
});