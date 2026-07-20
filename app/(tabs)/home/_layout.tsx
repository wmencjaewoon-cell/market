import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { useAppTheme } from '../../../hooks/use-app-theme';

function BackButton() {
  const theme = useAppTheme();

  return (
    <TouchableOpacity
      onPress={() => router.back()}
      style={{ paddingHorizontal: 12 }}
    >
      <Ionicons name="chevron-back" size={24} color={theme.text} />
    </TouchableOpacity>
  );
}

export default function HomeStackLayout() {
  const theme = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerBackTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ headerShown: false }}
      />

      <Stack.Screen
  name="regions"
  options={{
    headerShown: false,
  }}
/>

      <Stack.Screen
        name="region-search"
        options={{
          headerShown: true,
          title: '동네 추가',
        }}
      />

      <Stack.Screen
        name="user/[userId]"
        options={{
          title: "판매자 정보",
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="post/[id]"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="create/index"
        options={{
          title: '게시글 작성',
          headerShown: true,
          headerLeft: () => <BackButton />,
        }}
      />

      <Stack.Screen
        name="post/edit/[id]"
        options={{
          title: '게시글 수정',
          headerShown: true,
          headerLeft: () => <BackButton />,
        }}
      />


      <Stack.Screen
        name="create/sell"
        options={{
          title: '판매 등록',
          headerShown: true,
          headerLeft: () => <BackButton />,
        }}
      />

      <Stack.Screen
        name="create/share"
        options={{
          title: '나눔 등록',
          headerShown: true,
          headerLeft: () => <BackButton />,
        }}
      />

      <Stack.Screen
        name="create/want"
        options={{
          title: '구해요 등록',
          headerShown: true,
          headerLeft: () => <BackButton />,
        }}
      />
    </Stack>
  );
}
