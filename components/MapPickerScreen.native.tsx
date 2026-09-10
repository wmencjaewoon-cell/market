// 네이티브 위치 선택 화면: 지도 핀을 주소/좌표로 바꿔 작성 화면이나 채팅 이벤트에 돌려준다.
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/use-app-theme';
import { emitChatPlaceSelection } from '../lib/placeSelection';

export default function MapPickerScreen() {
  /**
   * 이 화면은 여러 곳에서 재사용한다.
   *
   * - 게시글 작성: returnTo가 홈 작성 화면이고 category를 유지해야 한다.
   * - 가게 프로필: returnTo가 `/store/profile`이고 가게 좌표/주소 draft로 돌아간다.
   * - 채팅 장소공유: returnTo 대신 event를 emit해서 기존 채팅 draft를 보존한다.
   */
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    returnTo?: string;
    category?: string;
    title?: string;
    desc?: string;
    buttonText?: string;
    mode?: string;
    chatRoomId?: string;
    useCurrentLocation?: string;
  }>();

  const mapRef = useRef<MapView | null>(null);
  // reverse geocode 요청이 연속으로 발생할 때 마지막 요청만 화면에 반영하기 위한 시퀀스 id다.
  const addressRequestRef = useRef(0);
  const theme = useAppTheme();

  /**
   * 지도 최초 중심 좌표를 계산한다.
   *
   * 기존 게시글/가게 위치를 다시 수정하는 경우에는 params의 lat/lng를 사용하고,
   * 새 위치를 고르는 경우에는 서울 중심 기본값에서 시작한 뒤 현재 위치 권한이 있으면 이동한다.
   */
  const initial = useMemo(() => {
    const latitude = Number(params.lat ?? 37.5665);
    const longitude = Number(params.lng ?? 126.9780);

    return {
      latitude: Number.isFinite(latitude) ? latitude : 37.5665,
      longitude: Number.isFinite(longitude) ? longitude : 126.9780,
    };
  }, [params.lat, params.lng]);

  const [marker, setMarker] = useState(initial);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [addressLoading, setAddressLoading] = useState(false);
  const returnTo = params.returnTo || '/(tabs)/home/create';
  const title = params.title || '거래 희망 장소 선택';
  const desc = params.desc || '핀을 옮겨서 원하는 거래 장소를 선택해 주세요.';
  const buttonText = params.buttonText || '이 위치로 선택';
  const isChatPlacePicker = params.mode === 'chat-place' && Boolean(params.chatRoomId);
  // 기존 객체 수정은 저장된 좌표에서 열려야 하므로 현재 위치 자동 이동을 끈다.
  // 새 객체 작성은 사용자가 가까운 위치를 고르기 쉽게 현재 위치로 이동한다.
  const shouldUseCurrentLocation = params.useCurrentLocation !== 'false';
  const insets = useSafeAreaInsets();
  

  useEffect(() => {
    if (!shouldUseCurrentLocation) return;
    goToMyLocation();
  }, [shouldUseCurrentLocation]);

  useEffect(() => {
    void loadAddress(marker);
  }, [marker]);

  /**
   * 좌표를 사람이 읽을 수 있는 주소로 바꾼다.
   *
   * 사용자가 지도를 빠르게 여러 번 누르면 이전 reverse geocode 응답이 늦게 도착할 수 있다.
   * `requestId`가 현재 ref와 다르면 낡은 응답이므로 selectedAddress를 갱신하지 않는다.
   */
  const loadAddress = async (coords: { latitude: number; longitude: number }) => {
    const requestId = addressRequestRef.current + 1;
    addressRequestRef.current = requestId;

    try {
      setAddressLoading(true);
      const address = await reverseGeocodeToAddress(coords);
      if (requestId !== addressRequestRef.current) return address;
      setSelectedAddress(address);
      return address;
    } catch {      if (requestId !== addressRequestRef.current) return '';
      setSelectedAddress('');
      return '';
    } finally {
      if (requestId === addressRequestRef.current) {
        setAddressLoading(false);
      }
    }
  };

  /**
   * 현재 위치 권한을 요청하고 지도 핀을 내 위치로 옮긴다.
   * 권한을 거부해도 화면은 계속 사용할 수 있고, 사용자는 지도를 직접 눌러 위치를 선택할 수 있다.
   */
  const goToMyLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert('위치 권한 필요', '내 위치를 사용하려면 위치 권한이 필요합니다.');
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };

      setMarker(coords);

      mapRef.current?.animateToRegion({
        ...coords,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } catch {    }
  };

  /**
   * 선택한 위치를 호출 화면에 전달한다.
   *
   * 채팅 장소공유는 route replace를 쓰면 채팅 입력 중인 상태가 날아갈 수 있어서
   * event bus로 전달하고 `router.back()`만 실행한다. 일반 작성/프로필 화면은
   * returnTo 경로로 replace하면서 lat/lng/address params를 전달한다.
   */
  const handleSelectLocation = async () => {
    const address = selectedAddress || (await loadAddress(marker));

    if (!address) {
      Alert.alert('주소 확인 실패', '선택한 위치의 주소를 확인하지 못했습니다.');
      return;
    }

    if (isChatPlacePicker) {
      // Chat place sharing is event-based so the chat room keeps its message draft.
      emitChatPlaceSelection({
        roomId: String(params.chatRoomId),
        address,
        latitude: marker.latitude,
        longitude: marker.longitude,
      });
      router.back();
      return;
    }

    // Form screens receive the picked location through route params after this replace.
    router.replace({
      pathname: returnTo as any,
      params: {
        lat: String(marker.latitude),
        lng: String(marker.longitude),
        address,
        ...(params.category ? { category: String(params.category) } : {}),
      },
    });
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title }} />

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          ...initial,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        // showsUserLocation
        onPress={(e) => setMarker(e.nativeEvent.coordinate)}
      >
        <Marker
          coordinate={marker}
          draggable
          onDragEnd={(e) => setMarker(e.nativeEvent.coordinate)}
        />
      </MapView>

      <View style={[styles.bottomPanel, { bottom: insets.bottom + 24 }]}>
        <View style={styles.panelHeader}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity
            style={[
              styles.myLocationBtn,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
            onPress={goToMyLocation}
          >
            <Ionicons name="locate" size={16} color={theme.text} />
            <Text style={[styles.myLocationBtnText, { color: theme.text }]}>내 위치</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.desc}>{desc}</Text>
        <Text style={styles.addressText}>
          {addressLoading
            ? '주소를 확인하는 중입니다.'
            : selectedAddress || '핀을 옮기면 주소가 표시됩니다.'}
        </Text>

        <TouchableOpacity
          style={styles.btn}
          onPress={handleSelectLocation}
        >
          <Text style={styles.btnText}>{buttonText}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  map: { flex: 1 },

  myLocationBtn: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  myLocationBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },

  bottomPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#111827' },
  desc: { marginTop: 6, color: '#6b7280', lineHeight: 20 },
  addressText: {
    marginTop: 10,
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  btn: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
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

async function reverseGeocodeToAddress(coords: { latitude: number; longitude: number }) {
  const [address] = await Location.reverseGeocodeAsync(coords);
  return formatAddress(address);
}
