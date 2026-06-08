import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { TouchableOpacity } from 'react-native';

export default function MyStackLayout() {
  return (
    <Stack
  screenOptions={{
    headerShown: true,
    headerTitleAlign: 'center',
    headerBackTitle: '',
  }}
>
  <Stack.Screen name="sales" options={{ title: '판매 관리' }} />
  <Stack.Screen name="purchases" options={{ title: '거래 내역' }} />
  <Stack.Screen name="favorites" options={{ title: '관심 목록' }} />
  <Stack.Screen name="keywords" options={{ title: '키워드 알림' }} />
  <Stack.Screen
    name="notifications"
    options={{
      title: '알림',
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 12 }}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
      ),
    }}
  />
</Stack>
  );
}
