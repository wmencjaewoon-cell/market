import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function MapPickerScreen() {
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    returnTo?: string;
    category?: string;
    title?: string;
    desc?: string;
    buttonText?: string;
  }>();

  const initial = useMemo(() => {
    const latitude = Number(params.lat ?? 37.5665);
    const longitude = Number(params.lng ?? 126.9780);

    return {
      latitude: Number.isFinite(latitude) ? latitude : 37.5665,
      longitude: Number.isFinite(longitude) ? longitude : 126.9780,
    };
  }, [params.lat, params.lng]);

  const [marker] = useState(initial);
  const returnTo = params.returnTo || '/(tabs)/home/create';
  const title = params.title || '거래 희망 장소 선택';
  const desc = params.desc || '웹에서는 지도 핀 선택 대신 앱에서 설정하는 방식을 추천합니다.';
  const buttonText = params.buttonText || '이 좌표로 임시 선택';

  return (
    <View style={styles.screen}>
      <View style={styles.fakeMap}>
        <Text style={styles.fakeMapTitle}>웹에서는 지도를 직접 조작할 수 없어요.</Text>
        <Text style={styles.fakeMapDesc}>
          앱에서 거래 희망 장소를 선택해 주세요.
        </Text>
        <Text style={styles.coords}>
          기본 좌표: {marker.latitude.toFixed(6)}, {marker.longitude.toFixed(6)}
        </Text>
      </View>

      <View style={styles.bottomPanel}>
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
                ...(params.category ? { category: String(params.category) } : {}),
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
  screen: { flex: 1, backgroundColor: '#fff' },
  fakeMap: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  fakeMapTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  fakeMapDesc: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: '#6b7280',
    textAlign: 'center',
  },
  coords: {
    marginTop: 12,
    fontSize: 13,
    color: '#374151',
  },
  bottomPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
