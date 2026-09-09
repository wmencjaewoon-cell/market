// 웹 인라인 지도 대체 UI: 실제 지도 대신 좌표 확인 버튼 역할을 한다.
import { Pressable, Text } from 'react-native';

type Props = {
  latitude: number;
  longitude: number;
  onPress?: () => void;
};

export default function InlineMap({ latitude, longitude, onPress }: Props) {
  if (!latitude || !longitude) return null;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? '지도 크게 보기' : undefined}
      style={{
        height: 180,
        borderRadius: 14,
        backgroundColor: '#f3f4f6',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
        거래 희망 장소
      </Text>
      <Text
        style={{
          marginTop: 8,
          color: '#6b7280',
          textAlign: 'center',
          lineHeight: 22,
        }}
      >
        지도 크게 보기를 눌러 거래 희망 장소를 확인할 수 있어요.
      </Text>
    </Pressable>
  );
}
