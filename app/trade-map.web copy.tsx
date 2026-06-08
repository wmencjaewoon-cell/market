import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function TradeMapScreenWeb() {
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    place?: string;
    region?: string;
  }>();
  const pinAddress = params.region || '주소 정보가 없습니다.';
  const detailPlaceText = params.place || '상세 거래장소가 입력되지 않았습니다.';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {/* <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity> */}
        <Text style={styles.headerTitle}>거래 희망 장소</Text>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.centerBox}>
        <Ionicons name="map-outline" size={48} color="#9ca3af" />
        <Text style={styles.title}>거래 희망 장소</Text>
        <Text style={styles.desc}>
          웹에서는 지도를 지원하지 않습니다. 모바일 앱에서 확인해 주세요.
        </Text>
        <Text style={styles.placeAddress}>{pinAddress}</Text>
        <Text style={styles.detailPlace}>{detailPlaceText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: {
    height: 56,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSide: {
    width: 40,
    height: 40,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  desc: {
    marginTop: 8,
    textAlign: 'center',
    color: '#6b7280',
    lineHeight: 21,
  },
  placeAddress: {
    marginTop: 12,
    color: '#111827',
    fontWeight: '800',
    lineHeight: 21,
    textAlign: 'center',
  },
  detailPlace: {
    marginTop: 6,
    color: '#374151',
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
});
