import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const CHAT_NOTIFICATION_CHANNEL_ID = 'chat_v2';
const PUSH_INSTALLATION_ID_KEY = 'push-installation-id-v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getCurrentExpoPushToken() {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return tokenData.data;
}

async function getPushInstallationId() {
  let installationId = await AsyncStorage.getItem(PUSH_INSTALLATION_ID_KEY);

  if (!installationId) {
    installationId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
      .toString(36)
      .slice(2)}`;
    await AsyncStorage.setItem(PUSH_INSTALLATION_ID_KEY, installationId);
  }

  return installationId;
}

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

    const token = await getCurrentExpoPushToken();
    if (!token) return;
    const installationId = await getPushInstallationId();

    const { error: rpcError } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
      p_installation_id: installationId,
    });

    if (!rpcError) return;

    if (!String(rpcError.message || '').includes('register_push_token')) {
      console.log('푸시 토큰 RPC 등록 실패:', rpcError);
    }

    const fallbackRow = {
      user_id: user.id,
      token,
      platform: Platform.OS,
      installation_id: installationId,
    };

    const { error: fallbackError } = await supabase.from('push_tokens').upsert(
      fallbackRow,
      {
        onConflict: 'user_id,token',
      }
    );

    if (!fallbackError) return;

    if (!String(fallbackError.message || '').includes('installation_id')) {
      console.log('푸시 토큰 fallback 등록 실패:', fallbackError);
      return;
    }

    await supabase.from('push_tokens').upsert(
      {
        user_id: user.id,
        token,
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

export async function unregisterPushToken() {
  try {
    if (Platform.OS === 'web') return;
    if (!Device.isDevice) return;

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return;

    const token = await getCurrentExpoPushToken();
    if (!token) return;
    const installationId = await getPushInstallationId();

    const { error: rpcError } = await supabase.rpc('unregister_push_token', {
      p_token: token,
      p_installation_id: installationId,
    });

    if (!rpcError) return;

    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('token', token);
  } catch (e) {
    console.log('푸시 토큰 해제 실패:', e);
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

type NotificationRouteData = {
  type?: string;
  roomId?: string;
  listingId?: number | string;
  estimateRequestId?: number | string;
  projectId?: string;
  projectMemberId?: string;
  inviteToken?: string;
  staffMemberId?: string;
};

const handledNotificationResponseKeys = new Set<string>();

function getNotificationResponseKey(response: Notifications.NotificationResponse) {
  const request = response.notification.request;
  const data = request.content.data as NotificationRouteData | undefined;

  return [
    request.identifier,
    response.actionIdentifier,
    data?.type,
    data?.roomId,
    data?.listingId,
    data?.estimateRequestId,
    data?.projectId,
    data?.inviteToken,
    request.content.title,
    request.content.body,
  ]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .join(':');
}

function openListingPost(listingId: number | string) {
  const normalizedListingId = String(listingId).trim();
  if (!normalizedListingId) return false;

  router.push(`/(tabs)/home/post/${normalizedListingId}` as any);
  return true;
}

function clearHandledNotificationResponse() {
  try {
    if (Platform.OS === 'web') return;

    Notifications.clearLastNotificationResponse();
  } catch (e) {
    console.log('알림 응답 정리 실패:', e);
  }
}

function routeNotificationData(data?: NotificationRouteData | null) {
  if (data?.type === 'chat' && data?.roomId) {
    router.push(`/chat/${data.roomId}` as any);
    return true;
  }

  if (data?.type === 'review') {
    if (data.roomId) {
      router.push(`/chat/${data.roomId}` as any);
      return true;
    }

    if (data.listingId) {
      return openListingPost(data.listingId);
    }
  }

  if (
    (data?.type === 'keyword_listing' ||
      data?.type === 'favorite_listing_updated') &&
    data?.listingId
  ) {
    return openListingPost(data.listingId);
  }

  if (data?.type === 'estimate_request') {
    if (data.estimateRequestId) {
      router.push(`/store/estimates?requestId=${data.estimateRequestId}` as any);
      return true;
    }

    router.push('/store/estimates' as any);
    return true;
  }

  if (data?.type === 'project_invite') {
    if (data.inviteToken) {
      router.push(`/project-invite/${data.inviteToken}` as any);
      return true;
    }

    if (data.projectId) {
      router.push(`/store/projects?projectId=${data.projectId}` as any);
      return true;
    }
  }

  if (
    (
      data?.type === 'project_schedule_created' ||
      data?.type === 'project_schedule_updated' ||
      data?.type === 'project_daily_report_created'
    ) &&
    data.roomId
  ) {
    router.push(`/chat/${data.roomId}` as any);
    return true;
  }

  if (data?.type === 'staff_password_reset_request') {
    router.push('/store/staff' as any);
    return true;
  }

  return false;
}

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const responseKey = getNotificationResponseKey(response);

  if (responseKey && handledNotificationResponseKeys.has(responseKey)) {
    return false;
  }

  const data = response.notification.request.content.data as
    | NotificationRouteData
    | undefined;
  const didRoute = routeNotificationData(data);

  if (didRoute && responseKey) {
    handledNotificationResponseKeys.add(responseKey);
  }

  if (didRoute) {
    clearHandledNotificationResponse();
  }

  return didRoute;
}

export function listenNotificationResponse() {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      handleNotificationResponse(response);
    }
  );

  return subscription;
}

export async function handleInitialNotificationResponse() {
  try {
    if (Platform.OS === 'web') return false;

    const response = Notifications.getLastNotificationResponse();
    if (!response) return false;

    return handleNotificationResponse(response);
  } catch (e) {
    console.log('초기 알림 이동 처리 실패:', e);
    return false;
  }
}
