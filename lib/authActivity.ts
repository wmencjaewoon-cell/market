// 인증 활동 기록: 로그인/보안 이벤트의 기기, 플랫폼, IP 보관 정책을 다룬다.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type AuthActivityEventType = 'login' | 'logout';

function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export async function logAuthActivity(eventType: AuthActivityEventType) {
  try {
    const { error } = await supabase.functions.invoke('log-auth-activity', {
      body: {
        eventType,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version || Constants.nativeAppVersion || null,
        deviceName: Device.deviceName || Device.modelName || null,
        osName: Device.osName || null,
        osVersion: Device.osVersion || null,
        timezone: getTimezone(),
      },
    });  } catch {  }
}
