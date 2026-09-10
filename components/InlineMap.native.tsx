// 네이티브 인라인 지도: 상세 화면 안에서 작은 미리보기 지도를 보여주고 탭 이벤트를 부모로 넘긴다.
import { Pressable, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

type Props = {
  latitude: number;
  longitude: number;
  onPress?: () => void;
};

export default function InlineMap({ latitude, longitude, onPress }: Props) {
  if (!latitude || !longitude) return null;

  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? '지도 크게 보기' : undefined}
    >
      <MapView
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        <Marker coordinate={{ latitude, longitude }} />
      </MapView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
