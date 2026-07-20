import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { useAppTheme } from '../hooks/use-app-theme';
import { installAdaptiveStyleSheetColors } from '../lib/adaptiveStyleSheetColors';
import { supabase } from '../lib/supabase';

installAdaptiveStyleSheetColors();

// iPhone 테스트 중 푸시 알림 초기화가 앱 실행을 방해하지 않도록 잠깐 꺼둡니다.
// 알림 테스트를 다시 할 때 true로 바꾸면 됩니다.
const ENABLE_PUSH_NOTIFICATIONS = true;

function PushNotificationRegister() {
  const { isReady } = useAuth();

  useEffect(() => {
    if (!ENABLE_PUSH_NOTIFICATIONS) return;

    let sub: { remove: () => void } | null = null;

    const setup = async () => {
      const {
        setupAndroidNotificationChannels,
        listenNotificationResponse,
      } = await import('../lib/notifications');

      await setupAndroidNotificationChannels();

      sub = listenNotificationResponse();
    };

    setup();

    return () => {
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (isReady && ENABLE_PUSH_NOTIFICATIONS) {
      import('../lib/notifications').then(({ registerPushToken }) => {
        registerPushToken();
      });
    }
  }, [isReady]);

  return null;
}

function AccountStatusGate() {
  const { isReady, user } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!isReady || !user) return;
    if (pathname === '/auth/callback' || pathname === '/account-deletion-pending') return;

    let cancelled = false;

    const checkAccountStatus = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled || error) return;

      if (data?.status === 'deletion_pending') {
        router.replace('/account-deletion-pending' as any);
      }
    };

    checkAccountStatus();

    return () => {
      cancelled = true;
    };
  }, [isReady, pathname, user]);

  return null;
}

function RootNavigator() {
  const { isReady } = useAuth();
  const theme = useAppTheme();

  if (!isReady) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right']}>
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="login" options={{ title: '로그인' }} />
        <Stack.Screen name="privacy" options={{ title: '개인정보처리방침' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen
          name="account-deletion-pending"
          options={{
            title: '탈퇴 진행 중',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="profile/edit" options={{ title: '내 프로필' }} />
        <Stack.Screen name="my/change-password" options={{ title: '비밀번호 변경' }} />
        <Stack.Screen name="admin" options={{ title: '관리자' }} />
        <Stack.Screen name="review/create" options={{ title: '리뷰 작성' }} />
        <Stack.Screen name="store/dashboard" options={{ title: '가게 대시보드' }} />
        <Stack.Screen name="store/product-create" options={{ title: '상품 등록' }} />
        <Stack.Screen name="store/products" options={{ title: '상품 관리' }} />
        <Stack.Screen name="store/estimates" options={{ title: '견적/고객관리' }} />
        <Stack.Screen name="store/profile" options={{ title: '가게 프로필' }} />
        <Stack.Screen name="store/staff" options={{ title: '직원 관리' }} />
        <Stack.Screen name="store/[id]" options={{ title: '가게 상세' }} />

        <Stack.Screen name="open-chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[roomId]" options={{ headerShown: false }} />
        <Stack.Screen name="my" options={{ headerShown: false }} />
        <Stack.Screen name="support" options={{ headerShown: false }} />
        <Stack.Screen
          name="trade-map"
          options={{
            headerShown: false,
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
       
      </Stack>
    </SafeAreaView>
  );
}

export default function RootLayout() {
  const theme = useAppTheme();
  const navigationTheme = {
    ...(theme.scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      primary: theme.primary,
      background: theme.background,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
      notification: theme.danger,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <SafeAreaProvider>
        <StatusBar
          style={theme.statusBarStyle}
          backgroundColor={theme.background}
          translucent={false}
        />

        <AuthProvider>
          <PushNotificationRegister />
          <AccountStatusGate />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
