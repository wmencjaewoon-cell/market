import { Stack } from 'expo-router';

export default function SupportStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleAlign: 'center',
        headerBackTitle: '',
      }}
    >
      <Stack.Screen name="notices" options={{ title: '공지사항' }} />
      <Stack.Screen name="help" options={{ title: '고객센터' }} />
    </Stack>
  );
}
