import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

function getHashParam(url: string, key: string) {
  if (!url.includes('#')) return null;

  const hash = url.split('#')[1];
  const hashParams = new URLSearchParams(hash);
  return hashParams.get(key);
}

async function createSessionFromCallbackUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  const code = (params as any)?.code;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(String(code));
    if (error) throw error;
    return;
  }

  const accessToken = (params as any)?.access_token || getHashParam(url, 'access_token');
  const refreshToken = (params as any)?.refresh_token || getHashParam(url, 'refresh_token');

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: String(accessToken),
      refresh_token: String(refreshToken),
    });

    if (error) throw error;
  }
}

async function moveAfterLogin() {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    router.replace('/login' as any);
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.status === 'deletion_pending') {
    router.replace('/account-deletion-pending' as any);
    return;
  }

  router.replace('/(tabs)/home' as any);
}

export default function AuthCallbackScreen() {
  const handledRef = useRef(false);
  const [message, setMessage] = useState('로그인을 완료하는 중입니다.');

  useEffect(() => {
  let mounted = true;

  const finish = async (url?: string | null) => {
    if (handledRef.current) return;
    handledRef.current = true;

    try {
      if (url) {
        await createSessionFromCallbackUrl(url);
      }

      await moveAfterLogin();
    } catch (e: any) {
      console.log('OAuth callback 처리 실패:', e);
      if (mounted) {
        setMessage(e?.message || '로그인을 완료하지 못했습니다.');
      }

      setTimeout(() => {
        router.replace('/login' as any);
      }, 1200);
    }
  };

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const currentUrl = window.location.href;

  const finishWebPopup = async () => {
    try {
      await createSessionFromCallbackUrl(currentUrl);

      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        throw new Error('로그인 세션을 저장하지 못했습니다.');
      }

      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          {
            type: 'SUPABASE_OAUTH_CALLBACK_SUCCESS',
          },
          window.location.origin
        );

        setMessage('로그인이 완료되었습니다. 창을 닫는 중입니다.');

        setTimeout(() => {
          window.close();
        }, 300);

        return;
      }

      await moveAfterLogin();
    } catch (e: any) {
      console.log('웹 OAuth callback 처리 실패:', e);

      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          {
            type: 'SUPABASE_OAUTH_CALLBACK_ERROR',
            message: e?.message || '로그인을 완료하지 못했습니다.',
          },
          window.location.origin
        );

        setTimeout(() => {
          window.close();
        }, 700);

        return;
      }

      if (mounted) {
        setMessage(e?.message || '로그인을 완료하지 못했습니다.');
      }

      setTimeout(() => {
        router.replace('/login' as any);
      }, 1200);
    }
  };

  void finishWebPopup();

  return () => {
    mounted = false;
  };
}

  Linking.getInitialURL().then((url) => {
    if (url) {
      void finish(url);
      return;
    }

    void finish(null);
  });

  const sub = Linking.addEventListener('url', ({ url }) => {
    void finish(url);
  });

  return () => {
    mounted = false;
    sub.remove();
  };
}, []);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#fff',
    padding: 24,
  },
  text: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
