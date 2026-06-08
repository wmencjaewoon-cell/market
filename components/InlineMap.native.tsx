import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

export default function InlineMap({ latitude, longitude }: any) {
  if (!latitude || !longitude) return null;

  return (
    <View style={{ height: 150, borderRadius: 12, overflow: 'hidden' }}>
      <MapView
        style={{ flex: 1 }}
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
    </View>
  );
}
