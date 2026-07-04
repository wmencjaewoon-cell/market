import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function TradeMapScreenWeb() {
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    place?: string;
    region?: string;
    title?: string;
  }>();
  const pinAddress = params.region || '주소 정보가 없습니다.';
  const mapTitle = params.title || '거래 희망 장소';
  const detailPlaceText = params.place || `${mapTitle} 상세 정보가 입력되지 않았습니다.`;
  const copyAddressText = pinAddress === '주소 정보가 없습니다.' ? '' : pinAddress.trim();
  const canCopyAddress = copyAddressText.length > 0;
  const showDetailPlace =
    detailPlaceText.trim().length > 0 &&
    detailPlaceText.trim() !== copyAddressText;

  const handleCopyAddress = async () => {
    if (!canCopyAddress) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyAddressText);
      } else {
        await Clipboard.setStringAsync(copyAddressText);
      }

      if (typeof window !== 'undefined') {
        window.alert('주소를 복사했습니다.');
      }
    } catch (e) {
      console.log('주소 복사 실패:', e);
      if (typeof window !== 'undefined') {
        window.alert('주소를 복사하지 못했습니다.');
      }
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <Text style={styles.headerTitle}>{mapTitle}</Text>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.centerBox}>
        <Ionicons name="map-outline" size={48} color="#9ca3af" />
        <Text style={styles.title}>{mapTitle}</Text>
        <Text style={styles.desc}>
          웹에서는 지도를 지원하지 않습니다. 모바일 앱에서 확인해 주세요.
        </Text>
        <Text style={styles.placeAddress}>{pinAddress}</Text>
        {canCopyAddress ? (
          <TouchableOpacity style={styles.copyAddressBtn} onPress={handleCopyAddress}>
            <Ionicons name="copy-outline" size={16} color="#2563eb" />
            <Text style={styles.copyAddressText}>주소 복사하기</Text>
          </TouchableOpacity>
        ) : null}
        {showDetailPlace ? <Text style={styles.detailPlace}>{detailPlaceText}</Text> : null}
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
  copyAddressBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copyAddressText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '800',
  },
});
