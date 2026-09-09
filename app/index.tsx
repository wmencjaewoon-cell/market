// 앱 루트 진입점: Expo Router가 시작되면 홈 탭으로 보낸다.
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}
