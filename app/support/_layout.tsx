import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { useAppTheme } from '../../hooks/use-app-theme';



function BackButton() {
  const theme = useAppTheme();
  const backColor = theme.scheme === 'dark' ? '#fff' : theme.text;

  return (
    <TouchableOpacity
      onPress={() => router.back()}
      style={{ paddingHorizontal: 12 }}
    >
      <Ionicons name="chevron-back" size={24} color={backColor} />
    </TouchableOpacity>
  );
}

export default function SupportStackLayout() {
  const theme = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleAlign: 'center',
        headerBackTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.scheme === 'dark' ? '#fff' : theme.text,
        headerTitleStyle: { color: theme.text },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="notices/index" options={{ title: '공지사항', headerLeft: () => <BackButton />, }} />
      <Stack.Screen name="notices/[id]" options={{ title: '공지사항', headerLeft: () => <BackButton />, }} />
      <Stack.Screen name="help" options={{ title: '고객센터', headerLeft: () => <BackButton />, }} />
    </Stack>
  );
}
