import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const CHAT_NOTIFICATION_CHANNEL_ID = 'chat_v2';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerPushToken() {
  try {
    if (Platform.OS === 'web') return;
    if (!Device.isDevice) return;

    await setupAndroidNotificationChannels();

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return;

    const permission = await Notifications.requestPermissionsAsync();
    if (permission.status !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    await supabase.from('push_tokens').upsert(
      {
        user_id: user.id,
        token: tokenData.data,
        platform: Platform.OS,
      },
      {
        onConflict: 'user_id,token',
      }
    );
  } catch (e) {
    console.log('푸시 토큰 등록 실패:', e);
  }
}

export async function setupAndroidNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: '기본 알림',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('chat', {
    name: '채팅 알림',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#166534',
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  await Notifications.setNotificationChannelAsync(CHAT_NOTIFICATION_CHANNEL_ID, {
    name: '채팅 알림',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#166534',
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export function listenNotificationResponse() {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        roomId?: string;
        listingId?: number | string;
      };

      if (data?.type === 'chat' && data?.roomId) {
        router.push(`/chat/${data.roomId}` as any);
        return;
      }

      if (data?.type === 'review') {
        if (data.roomId) {
          router.push(`/chat/${data.roomId}` as any);
          return;
        }

        if (data.listingId) {
          router.push(`/(tabs)/home/post/${data.listingId}` as any);
          return;
        }
      }

      if (data?.type === 'keyword_listing' && data?.listingId) {
        router.push(`/(tabs)/home/post/${data.listingId}` as any);
      }

      if (data?.type === 'favorite_listing_updated' && data?.listingId) {
        router.push(`/(tabs)/home/post/${data.listingId}` as any);
        return;
      }
    }
  );

  return subscription;
}
