import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { TouchableOpacity } from 'react-native';



function BackButton() {
  return (
    <TouchableOpacity
      onPress={() => router.back()}
      style={{ paddingHorizontal: 12 }}
    >
      <Ionicons name="chevron-back" size={24} color="#111827" />
    </TouchableOpacity>
  );
}

export default function SupportStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleAlign: 'center',
        headerBackTitle: '',
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="notices/index" options={{ title: '공지사항', headerLeft: () => <BackButton />, }} />
      <Stack.Screen name="notices/[id]" options={{ title: '공지사항', headerLeft: () => <BackButton />, }} />
      <Stack.Screen name="help" options={{ title: '고객센터', headerLeft: () => <BackButton />, }} />
    </Stack>
  );
}
