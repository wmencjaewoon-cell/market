// 푸시 알림 헬퍼: Expo push token 등록, 알림 수신, payload 기반 화면 이동을 처리한다.
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const CHAT_NOTIFICATION_CHANNEL_ID = 'chat_v2';
const PUSH_INSTALLATION_ID_KEY = 'push-installation-id-v1';

/**
 * 앱이 켜져 있는 상태에서 알림을 받았을 때의 기본 표시 정책이다.
 *
 * iOS/Android 모두 foreground 상태에서도 배너와 소리를 허용한다.
 * 채팅/견적/현장 알림은 별도 payload 라우팅이 있으므로 여기서는 화면 이동을 처리하지 않는다.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * 현재 설치된 앱의 Expo push token을 가져온다.
 *
 * 시뮬레이터나 웹은 실제 푸시를 받을 수 없으므로 null을 반환한다.
 * EAS projectId가 빠지면 Expo push token 발급이 실패할 수 있어 app config 값을 우선 사용한다.
 */
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

/**
 * 같은 사용자가 여러 기기에서 로그인했을 때 각 기기를 구분하는 로컬 id다.
 *
 * 토큰만 저장하면 앱 재설치/토큰 갱신 시 로그아웃 대상 정리가 애매해진다.
 * installation id를 함께 저장하면 특정 기기 로그아웃이나 전체 로그아웃 정책을 만들기 쉽다.
 */
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

/**
 * 로그인한 사용자의 현재 기기 push token을 서버에 등록한다.
 *
 * 1차로 `register_push_token` RPC를 호출하고, RPC가 아직 배포되지 않은 DB에서는
 * `push_tokens` 테이블 upsert로 fallback한다. installation_id 컬럼이 없는 구버전 DB까지
 * 고려해서 마지막 fallback은 token/platform만 저장한다.
 */
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

    if (!String(fallbackError.message || '').includes('installation_id')) {      return;
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
  } catch {  }
}

/**
 * 현재 기기 push token을 제거한다.
 *
 * 로그아웃 시 호출되어 더 이상 해당 기기로 채팅/견적/현장 알림이 가지 않게 한다.
 * RPC가 실패하면 최소한 user_id + token 기준 삭제를 시도한다.
 */
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
  } catch {  }
}

/**
 * Android 알림 채널을 만든다.
 *
 * Android는 채널이 한 번 생성되면 사용자가 시스템 설정에서 중요도/소리를 바꿀 수 있다.
 * `chat_v2`처럼 새 id를 쓰는 이유는 기존 채널 설정에 묶이지 않고 새 정책을 적용하기 위해서다.
 */
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

/**
 * 같은 알림 탭 이벤트가 두 번 처리되지 않도록 dedupe key를 만든다.
 *
 * 앱 시작 직후 `getLastNotificationResponse`와 listener가 같은 알림을 동시에 볼 수 있다.
 * key에 payload의 주요 id를 섞어두면 중복 push/replace로 화면이 두 번 쌓이는 문제를 줄일 수 있다.
 */
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

/**
 * 알림에서 게시글 상세로 들어갈 때 공통으로 쓰는 라우터다.
 * 키워드 알림과 관심글 변경 알림이 같은 이동 규칙을 사용한다.
 */
function openListingPost(listingId: number | string) {
  const normalizedListingId = String(listingId).trim();
  if (!normalizedListingId) return false;

  router.push(`/(tabs)/home/post/${normalizedListingId}` as any);
  return true;
}

/**
 * 이미 처리한 마지막 알림 응답을 OS/Expo 캐시에서 정리한다.
 * 정리하지 않으면 앱 재실행 때 이전 알림 이동이 반복될 수 있다.
 */
function clearHandledNotificationResponse() {
  try {
    if (Platform.OS === 'web') return;

    Notifications.clearLastNotificationResponse();
  } catch {  }
}

/**
 * 알림 payload를 실제 화면 이동으로 변환한다.
 *
 * 서버 Edge Function이나 DB RPC가 보내는 `type` 값은 여기와 맞아야 한다.
 * 예를 들어 `keyword_listing`은 게시글 상세, `project_invite`는 초대 수락 화면,
 * `project_schedule_created`는 연결된 현장 채팅방으로 이동한다.
 */
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

/**
 * 사용자가 알림을 눌렀을 때 한 번만 라우팅한다.
 *
 * dedupe set에 저장한 key가 있으면 무시하고, 정상 라우팅 후에는
 * Expo의 last notification response를 정리해서 다음 앱 실행에 남지 않게 한다.
 */
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

/**
 * 앱 실행 중 알림 탭 이벤트를 구독한다.
 * Root layout에서 한 번만 등록하고 unmount 때 subscription.remove()로 정리한다.
 */
export function listenNotificationResponse() {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      handleNotificationResponse(response);
    }
  );

  return subscription;
}

/**
 * 앱이 종료되어 있거나 백그라운드에 있다가 알림으로 열린 경우의 최초 이동 처리다.
 * listener보다 먼저 호출될 수 있으므로 `handleNotificationResponse`와 같은 dedupe 경로를 탄다.
 */
export async function handleInitialNotificationResponse() {
  try {
    if (Platform.OS === 'web') return false;

    const response = Notifications.getLastNotificationResponse();
    if (!response) return false;

    return handleNotificationResponse(response);
  } catch {    return false;
  }
}
