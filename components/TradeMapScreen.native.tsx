import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TradeMapScreen() {
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    place?: string;
    region?: string;
    title?: string;
  }>();
  const insets = useSafeAreaInsets();

  const latitude = Number(params.lat);
  const longitude = Number(params.lng);
  const mapTitle = params.title || '거래 희망 장소';
  const detailPlaceText = params.place || `${mapTitle} 상세 정보가 입력되지 않았습니다.`;
  const [pinAddress, setPinAddress] = useState(params.region || '');
  const copyAddressText = pinAddress.trim();
  const canCopyAddress = copyAddressText.length > 0;
  const showDetailPlace =
    detailPlaceText.trim().length > 0 &&
    detailPlaceText.trim() !== copyAddressText;

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const loadAddress = async () => {
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });

        const formatted = formatAddress(address);
        if (formatted) {
          setPinAddress(formatted);
        }
      } catch (e) {
        console.log('거래 희망 장소 주소 변환 실패:', e);
      }
    };

    loadAddress();
  }, [latitude, longitude]);

  const handleCopyAddress = async () => {
    if (!canCopyAddress) return;

    try {
      await Clipboard.setStringAsync(copyAddressText);
      Alert.alert('주소 복사', '주소를 복사했습니다.');
    } catch (e) {
      console.log('주소 복사 실패:', e);
      Alert.alert('주소 복사', '주소를 복사하지 못했습니다.');
    }
  };

  return (
    <View style={styles.screen}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        <Marker
          coordinate={{ latitude, longitude }}
          title={mapTitle}
          description={detailPlaceText}
        />
      </MapView>

      <View style={[styles.header, { top: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{mapTitle}</Text>
        <View style={styles.headerSide} />
      </View>

      <View style={[styles.bottomBox, { bottom: Math.max(insets.bottom + 16, 24) }]}>
        <Text style={styles.placeTitle}>{mapTitle}</Text>
        <Text style={styles.placeAddress}>{pinAddress || '주소를 불러오는 중입니다.'}</Text>
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
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
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
  bottomBox: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 16,
  },
  placeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  placeAddress: {
    marginTop: 8,
    color: '#111827',
    fontWeight: '800',
    lineHeight: 21,
  },
  detailPlace: {
    marginTop: 6,
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  copyAddressBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
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

function compactRegionName(region?: string | null) {
  return (region || '')
    .replace('특별자치도', '')
    .replace('특별자치시', '')
    .replace('광역시', '')
    .replace('특별시', '')
    .trim();
}

function formatAddress(address?: Location.LocationGeocodedAddress) {
  if (!address) return '';

  const region = compactRegionName(address.region);
  const district = address.city || address.district || address.subregion || '';
  const road = [address.street, address.streetNumber].filter(Boolean).join(' ');

  const fallback = [
    region,
    district,
    address.subregion,
    address.name,
  ].filter(Boolean);

  const parts = road ? [region, district, road] : fallback;

  return Array.from(new Set(parts)).join(' ').trim();
}
