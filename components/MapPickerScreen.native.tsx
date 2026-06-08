import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MapPickerScreen() {
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    returnTo?: string;
    title?: string;
    desc?: string;
    buttonText?: string;
  }>();

  const mapRef = useRef<MapView | null>(null);

  const initial = useMemo(() => {
    const latitude = Number(params.lat ?? 37.5665);
    const longitude = Number(params.lng ?? 126.9780);

    return {
      latitude: Number.isFinite(latitude) ? latitude : 37.5665,
      longitude: Number.isFinite(longitude) ? longitude : 126.9780,
    };
  }, [params.lat, params.lng]);

  const [marker, setMarker] = useState(initial);
  const returnTo = params.returnTo || '/(tabs)/home/create/share';
  const title = params.title || '거래 희망 장소 선택';
  const desc = params.desc || '핀을 옮겨서 원하는 거래 장소를 선택해 주세요.';
  const buttonText = params.buttonText || '이 위치로 선택';
  const insets = useSafeAreaInsets();
  

  useEffect(() => {
    goToMyLocation();
  }, []);

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
    } catch (e) {
      console.log('현재 위치 가져오기 실패:', e);
    }
  };

  return (
    <View style={styles.screen}>
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

      <TouchableOpacity
  style={[styles.myLocationBtn, { bottom: insets.bottom + 178 }]}
  onPress={goToMyLocation}
>
        <Ionicons name="locate" size={24} color="#111827" />
      </TouchableOpacity>

      <View style={[styles.bottomPanel, { bottom: insets.bottom + 24 }]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{desc}</Text>

        <TouchableOpacity
          style={styles.btn}
          onPress={() =>
            router.replace({
              pathname: returnTo as any,
              params: {
                lat: String(marker.latitude),
                lng: String(marker.longitude),
              },
            })
          }
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
  position: 'absolute',
  right: 28,
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: '#fff',
  alignItems: 'center',
  justifyContent: 'center',
  elevation: 4,
  shadowColor: '#000',
  shadowOpacity: 0.16,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
},

bottomPanel: {
  position: 'absolute',
  left: 16,
  right: 16,
  backgroundColor: '#fff',
  borderRadius: 18,
  padding: 16,
},
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  desc: { marginTop: 6, color: '#6b7280', lineHeight: 20 },
  btn: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
});
