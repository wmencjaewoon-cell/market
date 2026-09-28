// 하단 탭: 홈/AS문의/채팅/내정보와 채팅 배지, 탭 재선택 새로고침을 관리한다.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { SHOW_FULL_APP_MENUS, SIMPLE_AS_MODE } from '../../lib/appMode';
import { useAppTheme } from '../../hooks/use-app-theme';
import { getAsPalette } from '../../lib/asAppearance';
import { getUnreadChatCount } from '../../lib/chat';
import { supabase } from '../../lib/supabase';
import { emitTabRefresh, type RefreshableTab } from '../../lib/tabRefresh';

export default function TabsLayout() {
  const { user } = useAuth();
  const userId = user?.id;
  const pathname = usePathname();
  const appTheme = useAppTheme();
  const theme = SIMPLE_AS_MODE ? getAsPalette(appTheme) : appTheme;
  const insets = useSafeAreaInsets();
  const showFullMenus = !SIMPLE_AS_MODE || SHOW_FULL_APP_MENUS;

  const [chatBadge, setChatBadge] = useState(0);
  const tabBarBottomPadding = Math.max(insets.bottom, 8);
  const tabBarHeight = 58 + tabBarBottomPadding;
  const shouldHideTabBar =
    pathname.startsWith('/chat/') || pathname.startsWith('/open-chat/');

  const loadUnreadCount = async () => {
    try {
      const count = await getUnreadChatCount();
      setChatBadge(count);
    } catch {    }
  };

  useEffect(() => {
    if (!userId) {
      setChatBadge(0);
      return;
    }

    loadUnreadCount();

    const channel = supabase.channel(`chat-badge-${userId}-${Date.now()}`);

channel.on(
  'postgres_changes',
  {
    event: '*',
    schema: 'public',
    table: 'chat_messages',
  },
  () => {
    loadUnreadCount();
  }
);

channel.on(
  'postgres_changes',
  {
    event: '*',
    schema: 'public',
    table: 'chat_message_reads',
  },
  () => {
    loadUnreadCount();
  }
);

channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const openTab = (tab: RefreshableTab, href: string) => {
    const rootPath = `/${tab}`;

    if (
      pathname === rootPath ||
      pathname === `${rootPath}/` ||
      pathname === href ||
      pathname === `${href}/`
    ) {
      emitTabRefresh(tab);
      return;
    }

    router.replace(href as any);
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.background },
        tabBarActiveTintColor: SIMPLE_AS_MODE ? theme.primary : theme.text,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: shouldHideTabBar
          ? { display: 'none' }
          : {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
              height: tabBarHeight,
              paddingTop: 6,
              paddingBottom: tabBarBottomPadding,
            },
        tabBarItemStyle: {
          minHeight: 50,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarBadgeStyle: {
          backgroundColor: SIMPLE_AS_MODE ? '#0037b0' : '#166534',
          color: '#fff',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openTab('home', '/(tabs)/home');
          },
        }}
        options={{
          title: '홈',
          tabBarAccessibilityLabel: '홈',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="home-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="as-inquiry"
        options={{
          href: SIMPLE_AS_MODE ? undefined : null,
          title: 'AS문의',
          tabBarAccessibilityLabel: 'AS문의',
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ color, size }) => <Ionicons name="construct-outline" color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="map"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openTab('map', '/(tabs)/map');
          },
        }}
        options={{
          href: null,
          title: '지도',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="chat"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openTab('chat', '/(tabs)/chat');
          },
        }}
        options={{
          title: SIMPLE_AS_MODE && !showFullMenus ? '문의채팅' : '채팅',
          tabBarAccessibilityLabel: '채팅',

          tabBarBadge:
            chatBadge > 0
              ? chatBadge > 99
                ? '99+'
                : chatBadge
              : undefined,

          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="my"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openTab('my', '/(tabs)/my');
          },
        }}
        options={{
          title: '내정보',
          tabBarAccessibilityLabel: '내정보',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
