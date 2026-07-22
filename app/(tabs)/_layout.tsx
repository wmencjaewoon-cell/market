import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../hooks/use-app-theme';
import { getUnreadChatCount } from '../../lib/chat';
import { supabase } from '../../lib/supabase';
import { emitTabRefresh, type RefreshableTab } from '../../lib/tabRefresh';

export default function TabsLayout() {
  const { user } = useAuth();
  const pathname = usePathname();
  const theme = useAppTheme();

  const [chatBadge, setChatBadge] = useState(0);

  const loadUnreadCount = async () => {
    try {
      const count = await getUnreadChatCount();
      setChatBadge(count);
    } catch (e) {
      console.log('채팅 배지 불러오기 실패:', e);
    }
  };

  useEffect(() => {
    if (!user) {
      setChatBadge(0);
      return;
    }

    loadUnreadCount();

    const channel = supabase.channel(`chat-badge-${user.id}-${Date.now()}`);

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
  }, [user?.id]);

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
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
        },
        tabBarBadgeStyle: {
          backgroundColor: '#166534',
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
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
          title: '채팅',

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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
