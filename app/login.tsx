import type { User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type UserType = 'store' | 'personal';
type AuthMode = 'login' | 'signup';
type OAuthProvider = 'kakao' | 'custom:naver';
type ExistingProfile = {
  id: string;
  status: string | null;
  deletion_requested_at: string | null;
  deletion_scheduled_at: string | null;
};

const socialProviderLabel: Record<OAuthProvider, string> = {
  kakao: '카카오',
  'custom:naver': '네이버',
};

function formatDeletionDate(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LoginScreen() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [userType, setUserType] = useState<UserType>('personal');

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedNotice, setAgreedNotice] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [profileSetupRequired, setProfileSetupRequired] = useState(false);
  const [deletionPendingProfile, setDeletionPendingProfile] =
    useState<ExistingProfile | null>(null);
  const [isAppleSignInAvailable, setIsAppleSignInAvailable] = useState(false);

  const showProfileFields = authMode === 'signup' || profileSetupRequired;

  useEffect(() => {
    let mounted = true;

    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (mounted) setIsAppleSignInAvailable(available);
      })
      .catch(() => {
        if (mounted) setIsAppleSignInAvailable(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const goNext = () => {
    if (typeof redirect === 'string' && redirect.length > 0) {
      router.replace(redirect as any);
    } else {
      router.replace('/(tabs)/home' as any);
    }
  };

  const createSessionFromUrl = async (url: string) => {
  console.log('callback url:', url);

  const parsedUrl = new URL(url);

  const searchParams = parsedUrl.searchParams;
  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));

  const error =
    searchParams.get('error') ||
    hashParams.get('error') ||
    searchParams.get('error_code') ||
    hashParams.get('error_code');

  const errorDescription =
    searchParams.get('error_description') ||
    hashParams.get('error_description');

  if (error) {
    throw new Error(errorDescription || error);
  }

  const code = searchParams.get('code') || hashParams.get('code');

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return;
  }

  const accessToken = searchParams.get('access_token') || hashParams.get('access_token');
  const refreshToken = searchParams.get('refresh_token') || hashParams.get('refresh_token');

  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) throw sessionError;
    return;
  }

  const { data } = await supabase.auth.getSession();

  if (data.session) {
    return;
  }

  throw new Error(
    `OAuth 토큰을 받지 못했습니다. callback URL을 확인해 주세요: ${parsedUrl.origin}${parsedUrl.pathname}`
  );
};;

  const getCurrentUser = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw new Error('로그인된 사용자를 찾을 수 없습니다.');
    }

    return data.user;
  };

  const getOAuthRedirectTo = () => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/auth/callback`;
    }

    return 'https://interior-market.wmenc.co.kr/auth/callback';
  }

  return 'interiormarket:///auth/callback';
};

  const getAppleNonce = async () => {
    const rawBytes = Crypto.getRandomBytes(32);
    const rawNonce = Array.from(rawBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    return { rawNonce, hashedNonce };
  };

  const fetchExistingProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, status, deletion_requested_at, deletion_scheduled_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    return data as ExistingProfile | null;
  };

  const getFormProfileInput = () => ({
    userType,
    displayName: displayName.trim(),
    phone: phone.trim(),
  });

  const saveProfile = async (
    profileInput = getFormProfileInput(),
    currentUser?: User
  ) => {
    const profileUser = currentUser ?? (await getCurrentUser());

    const { error } = await supabase.from('profiles').upsert({
      id: profileUser.id,
      user_type: profileInput.userType,
      display_name: profileInput.displayName,
      email: email.trim() || profileUser.email || null,
      phone: profileInput.phone || null,
      is_phone_public: profileInput.userType === 'store',
      status: 'active',
      trust_points: 0,
      trust_level: 1,
      seller_level_style: 'clean',
      reports_count: 0,
      can_create_listing: true,
      can_start_chat: true,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
  };

  const validateProfileInput = () => {
    if (!agreedTerms || !agreedNotice) {
      setMessage('이용약관과 거래 책임 안내에 동의해 주세요.');
      return false;
    }

    if (!displayName.trim()) {
      setMessage(userType === 'store' ? '상호명을 입력해 주세요.' : '닉네임을 입력해 주세요.');
      return false;
    }

    if (!phone.trim()) {
      setMessage('전화번호를 입력해 주세요.');
      return false;
    }

    setMessage('');
    return true;
  };

  const getProfileInputFromMetadata = (currentUser: User) => {
    const metadata = currentUser.user_metadata || {};
    const metadataUserType: UserType = metadata.user_type === 'store' ? 'store' : 'personal';
    const metadataDisplayName =
      typeof metadata.display_name === 'string' ? metadata.display_name.trim() : '';
    const metadataPhone = typeof metadata.phone === 'string' ? metadata.phone.trim() : '';

    if (!metadataDisplayName || !metadataPhone) {
      return null;
    }

    return {
      userType: metadataUserType,
      displayName: metadataDisplayName,
      phone: metadataPhone,
    };
  };

  const ensureProfileAfterLogin = async () => {
    const currentUser = await getCurrentUser();
    const existingProfile = await fetchExistingProfile(currentUser.id);

    if (existingProfile) {
      if (existingProfile.status === 'deletion_pending') {
        setProfileSetupRequired(false);
        setDeletionPendingProfile(existingProfile);
        setMessage('탈퇴 대기 중인 계정입니다. 복구하려면 아래 버튼을 눌러 주세요.');
        return false;
      }

      setDeletionPendingProfile(null);
      setProfileSetupRequired(false);
      return true;
    }

    const formProfileInput = getFormProfileInput();

    if (
      agreedTerms &&
      agreedNotice &&
      formProfileInput.displayName &&
      formProfileInput.phone
    ) {
      await saveProfile(formProfileInput, currentUser);
      setDeletionPendingProfile(null);
      setProfileSetupRequired(false);
      return true;
    }

    const metadataProfileInput = getProfileInputFromMetadata(currentUser);

    if (metadataProfileInput) {
      await saveProfile(metadataProfileInput, currentUser);
      setDeletionPendingProfile(null);
      setProfileSetupRequired(false);
      return true;
    }

    setDeletionPendingProfile(null);
    setProfileSetupRequired(true);
    setMessage('처음 로그인이라 프로필 정보가 필요합니다. 닉네임과 전화번호를 입력해 주세요.');
    return false;
  };

  const completeProfileSetup = async () => {
    if (!validateProfileInput()) return;

    try {
      setLoading(true);
      setMessage('');

      const currentUser = await getCurrentUser();
      const existingProfile = await fetchExistingProfile(currentUser.id);

      if (!existingProfile) {
        await saveProfile(getFormProfileInput(), currentUser);
      }

      setDeletionPendingProfile(null);
      setProfileSetupRequired(false);
      goNext();
    } catch (e: any) {
      setMessage(e?.message || '프로필을 저장하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const runOAuthLogin = async (provider: OAuthProvider) => {
  if (authMode === 'signup' && !validateProfileInput()) return;

  try {
    setLoading(true);
    setMessage('');
    setDeletionPendingProfile(null);

    const redirectTo = getOAuthRedirectTo();

    console.log('redirectTo:', redirectTo);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;

    if (!data?.url) {
      throw new Error(`${socialProviderLabel[provider]} 로그인 URL을 받지 못했습니다.`);
    }

    // 웹에서는 작은 팝업창으로 로그인하고,
    // 로그인 완료 후 auth/callback에서 부모창으로 URL을 전달받아 원래 창에서 세션 처리
    if (Platform.OS === 'web') {
      await new Promise<void>((resolve, reject) => {
        const popup = window.open(
          data.url,
          `${socialProviderLabel[provider]}Login`,
          'width=430,height=720,menubar=no,toolbar=no,location=no,status=no'
        );

        if (!popup) {
          reject(new Error('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.'));
          return;
        }

        let done = false;

        const cleanup = () => {
          window.removeEventListener('message', handleMessage);
          clearInterval(checkClosed);
        };

        const handleMessage = async (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return;

  const messageData = event.data;

  console.log('oauth popup message:', messageData);

  if (!messageData) return;

  if (messageData.type === 'SUPABASE_OAUTH_CALLBACK_ERROR') {
    done = true;
    cleanup();
    reject(new Error(messageData.message || `${socialProviderLabel[provider]} 로그인에 실패했습니다.`));
    return;
  }

  if (messageData.type !== 'SUPABASE_OAUTH_CALLBACK_SUCCESS') {
    return;
  }

  done = true;
  cleanup();

  try {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      throw new Error('로그인 세션을 찾지 못했습니다.');
    }

    const profileReady = await ensureProfileAfterLogin();

    if (profileReady) {
      goNext();
    }

    resolve();
  } catch (callbackError) {
    reject(callbackError);
  }
};

        const checkClosed = setInterval(() => {
          if (!popup.closed) return;

          cleanup();

          if (!done) {
            reject(new Error(`${socialProviderLabel[provider]} 로그인이 완료되지 않았습니다.`));
          }
        }, 500);

        window.addEventListener('message', handleMessage);
      });

      return;
    }

    // 모바일 앱에서는 기존처럼 WebBrowser.openAuthSessionAsync 사용
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    console.log('auth result:', result);

    if (result.type !== 'success') {
      setMessage(`${socialProviderLabel[provider]} 로그인이 완료되지 않았습니다.`);
      return;
    }

    await createSessionFromUrl(result.url);

    const profileReady = await ensureProfileAfterLogin();

    if (profileReady) {
      goNext();
    }
  } catch (e: any) {
    console.log(`${socialProviderLabel[provider]} 로그인 오류:`, e);

    const errorMessage = e?.message || '';

    if (
      provider === 'custom:naver' &&
      (errorMessage.includes('Unsupported provider') ||
        errorMessage.includes('custom provider') ||
        errorMessage.includes('not found'))
    ) {
      setMessage(
        'Supabase에 네이버 로그인 provider가 아직 등록되지 않았습니다. Auth Providers에서 custom:naver 설정을 확인해 주세요.'
      );
      return;
    }

    setMessage(errorMessage || `${socialProviderLabel[provider]} 로그인 중 오류가 발생했습니다.`);
  } finally {
    setLoading(false);
  }
};

  const handleKakaoLogin = () => runOAuthLogin('kakao');

  const handleNaverLogin = () => runOAuthLogin('custom:naver');

  const handleAppleLogin = async () => {
    if (authMode === 'signup' && !validateProfileInput()) return;

    if (Platform.OS !== 'ios' || !isAppleSignInAvailable) {
      setMessage('Apple 로그인은 iOS에서만 사용할 수 있습니다.');
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      setDeletionPendingProfile(null);

      const { rawNonce, hashedNonce } = await getAppleNonce();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error('Apple 로그인 토큰을 받지 못했습니다.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) throw error;

      const profileReady = await ensureProfileAfterLogin();

      if (profileReady) {
        goNext();
      }
    } catch (e: any) {
      console.log('Apple 로그인 오류:', e);

      if (e?.code === 'ERR_REQUEST_CANCELED') {
        setMessage('Apple 로그인이 취소되었습니다.');
      } else {
        setMessage(e?.message || 'Apple 로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (authMode === 'signup' && !validateProfileInput()) return;

    if (!email.trim()) {
      setMessage('이메일을 입력해 주세요.');
      return;
    }

    if (!password.trim()) {
      setMessage('비밀번호를 입력해 주세요.');
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      setDeletionPendingProfile(null);

      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: {
              user_type: userType,
              display_name: displayName.trim(),
              phone: phone.trim(),
              is_phone_public: userType === 'store',
            },
          },
        });

        if (error) throw error;

        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMessage(
            '이미 가입되었거나 탈퇴 대기 중인 이메일입니다. 기존 계정으로 로그인해 복구하거나 3일 후 다시 시도해 주세요.'
          );
          return;
        }

        if (data.session) {
          const profileReady = await ensureProfileAfterLogin();

          if (profileReady) {
            goNext();
          }

          return;
        }

        setMessage('회원가입이 완료되었습니다. 이메일 확인 후 로그인해 주세요.');
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        if (error) throw error;
      }

      const profileReady = await ensureProfileAfterLogin();

      if (profileReady) {
        goNext();
      }
    } catch (e: any) {
      const errorMessage = e?.message || '이메일 로그인 중 오류가 발생했습니다.';

      if (
        authMode === 'signup' &&
        (errorMessage.includes('already') || errorMessage.includes('registered'))
      ) {
        setMessage(
          '이미 가입되었거나 탈퇴 대기 중인 이메일입니다. 기존 계정으로 로그인해 복구하거나 3일 후 다시 시도해 주세요.'
        );
      } else {
        setMessage(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelAccountDeletion = async () => {
    if (loading) return;

    try {
      setLoading(true);
      setMessage('');

      const { error } = await supabase.rpc('cancel_current_user_deletion');

      if (error) {
        setMessage(
          error.message.includes('grace period')
            ? '탈퇴 취소 가능 기간이 지나 복구할 수 없습니다.'
            : error.message
        );
        return;
      }

      setDeletionPendingProfile(null);
      goNext();
    } catch (e: any) {
      setMessage(e?.message || '탈퇴 취소 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const signOutPendingAccount = async () => {
    await supabase.auth.signOut();
    setDeletionPendingProfile(null);
    setProfileSetupRequired(false);
    setMessage('');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>로그인 / 회원가입</Text>

      {deletionPendingProfile ? (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>탈퇴 진행 중입니다</Text>
          <Text style={styles.pendingText}>
            탈퇴 대기 중에는 채팅, 게시글 작성 등 서비스 이용이 제한됩니다.
            탈퇴 요청 후 3일 동안은 계정을 복구할 수 있습니다.
          </Text>
          <Text style={styles.pendingDate}>
            복구 가능 기한:{' '}
            {formatDeletionDate(deletionPendingProfile.deletion_scheduled_at) || '확인 필요'}
          </Text>

          <TouchableOpacity
            style={[styles.darkBtn, loading && styles.disabledBtn]}
            onPress={cancelAccountDeletion}
            disabled={loading}
          >
            <Text style={styles.darkBtnText}>
              {loading ? '처리 중...' : '탈퇴 취소'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={signOutPendingAccount}
            disabled={loading}
          >
            <Text style={styles.outlineBtnText}>확인</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, authMode === 'login' && styles.modeBtnActive]}
              onPress={() => setAuthMode('login')}
            >
              <Text style={[styles.modeText, authMode === 'login' && styles.modeTextActive]}>
                이메일 로그인
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, authMode === 'signup' && styles.modeBtnActive]}
              onPress={() => setAuthMode('signup')}
            >
              <Text style={[styles.modeText, authMode === 'signup' && styles.modeTextActive]}>
                이메일 회원가입
              </Text>
            </TouchableOpacity>
          </View>

          {showProfileFields ? (
        <>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.typeBtn, userType === 'personal' && styles.typeBtnActive]}
              onPress={() => setUserType('personal')}
            >
              <Text
                style={[styles.typeBtnText, userType === 'personal' && styles.typeBtnTextActive]}
              >
                개인
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeBtn, userType === 'store' && styles.typeBtnActive]}
              onPress={() => setUserType('store')}
            >
              <Text style={[styles.typeBtnText, userType === 'store' && styles.typeBtnTextActive]}>
                가게
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => setAgreedTerms(!agreedTerms)}>
            <Text style={styles.checkText}>
              {agreedTerms ? '☑' : '☐'} 이용약관에 동의합니다.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setAgreedNotice(!agreedNotice)}>
            <Text style={styles.checkText}>
              {agreedNotice ? '☑' : '☐'} 거래 책임은 거래 당사자에게 있습니다.
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder={userType === 'store' ? '상호명' : '닉네임'}
            value={displayName}
            onChangeText={setDisplayName}
          />

          <TextInput
            style={styles.input}
            placeholder="전화번호"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </>
          ) : null}

          {profileSetupRequired ? (
            <TouchableOpacity style={styles.darkBtn} onPress={completeProfileSetup} disabled={loading}>
              <Text style={styles.darkBtnText}>
                {loading ? '처리 중...' : '프로필 저장하고 시작하기'}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.kakaoBtn, loading && styles.disabledBtn]}
                onPress={handleKakaoLogin}
                disabled={loading}
              >
                <Text style={styles.kakaoText}>
                  {loading ? '처리 중...' : '카카오계정으로 로그인'}
                </Text>
              </TouchableOpacity>

              {Platform.OS === 'ios' && isAppleSignInAvailable ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    authMode === 'signup'
                      ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                      : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  }
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={14}
                  style={[styles.appleNativeBtn, loading && styles.disabledNativeBtn]}
                  onPress={loading ? () => {} : handleAppleLogin}
                />
              ) : null}

              <TouchableOpacity
                style={[styles.naverBtn, loading && styles.disabledBtn]}
                onPress={handleNaverLogin}
                disabled={loading}
              >
                <Text style={styles.naverText}>
                  {loading ? '처리 중...' : '네이버로 로그인'}
                </Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TextInput
                style={styles.input}
                placeholder="이메일"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <TextInput
                style={styles.input}
                placeholder="비밀번호"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />

              <TouchableOpacity style={styles.darkBtn} onPress={handleEmailAuth} disabled={loading}>
                <Text style={styles.darkBtnText}>
                  {loading
                    ? '처리 중...'
                    : authMode === 'signup'
                    ? '이메일로 회원가입'
                    : '이메일로 로그인'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, gap: 14 },
  title: { fontSize: 28, fontWeight: '800' },

  modeRow: { flexDirection: 'row', gap: 10 },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  modeText: { fontWeight: '700', color: '#374151' },
  modeTextActive: { color: '#fff' },

  row: { flexDirection: 'row', gap: 10 },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  typeBtnText: { fontWeight: '700', color: '#374151' },
  typeBtnTextActive: { color: '#fff' },

  checkText: { color: '#374151', lineHeight: 22 },

  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
  },

  kakaoBtn: {
    backgroundColor: '#FEE500',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
  },
  kakaoText: { color: '#191919', fontWeight: '800' },
  appleNativeBtn: {
    width: '100%',
    height: 50,
  },
  naverBtn: {
    backgroundColor: '#03c75a',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
  },
  naverText: { color: '#fff', fontWeight: '800' },

  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 6,
  },

  darkBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
  },
  darkBtnText: { color: '#fff', fontWeight: '800' },
  disabledBtn: {
    opacity: 0.65,
  },
  disabledNativeBtn: {
    opacity: 0.65,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
  },
  outlineBtnText: {
    color: '#374151',
    fontWeight: '800',
  },
  pendingBox: {
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#fff7f7',
    gap: 12,
  },
  pendingTitle: {
    color: '#991b1b',
    fontSize: 18,
    fontWeight: '900',
  },
  pendingText: {
    color: '#7f1d1d',
    fontSize: 14,
    lineHeight: 22,
  },
  pendingDate: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },

  message: {
    color: '#dc2626',
    fontWeight: '600',
    lineHeight: 20,
  },
});
