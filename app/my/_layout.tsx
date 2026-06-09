import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { TouchableOpacity } from 'react-native';

function BackButton() {
  return (
    <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 12 }}>
      <Ionicons name="chevron-back" size={24} color="#111827" />
    </TouchableOpacity>
  );
}

export default function MyStackLayout() {
  return (
    <Stack
  screenOptions={{
    headerShown: true,
    headerTitleAlign: 'center',
    headerBackTitle: '',
    headerLeft: () => <BackButton />,
  }}
>
  <Stack.Screen name="sales" options={{ title: '판매 관리' }} />
  <Stack.Screen name="purchases" options={{ title: '거래 내역' }} />
  <Stack.Screen name="favorites" options={{ title: '관심 목록' }} />
  <Stack.Screen name="keywords" options={{ title: '키워드 알림' }} />
  <Stack.Screen name="notifications" options={{ title: '알림' }} />
  <Stack.Screen name="privacy" options={{ title: '개인정보처리방침' }} />
  <Stack.Screen name="terms" options={{ title: '이용약관' }} />
  <Stack.Screen name="blocked-users" options={{ title: '차단한 사용자' }} />
  <Stack.Screen name="delete-account" options={{ title: '회원탈퇴' }} />
</Stack>
  );
}
