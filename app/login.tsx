import type { User } from '@supabase/supabase-js';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
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

  const showProfileFields = authMode === 'signup' || profileSetupRequired;

  const goNext = () => {
    if (typeof redirect === 'string' && redirect.length > 0) {
      router.replace(redirect as any);
    } else {
      router.replace('/(tabs)/home' as any);
    }
  };

  const createSessionFromUrl = async (url: string) => {
    console.log('callback url:', url);

    const { params, errorCode } = QueryParams.getQueryParams(url);

    if (errorCode) {
      throw new Error(errorCode);
    }

    let access_token = (params as any)?.access_token;
    let refresh_token = (params as any)?.refresh_token;

    if ((!access_token || !refresh_token) && url.includes('#')) {
      const hash = url.split('#')[1];
      const hashParams = new URLSearchParams(hash);
      access_token = access_token || hashParams.get('access_token') || undefined;
      refresh_token = refresh_token || hashParams.get('refresh_token') || undefined;
    }

    if (!access_token || !refresh_token) {
      throw new Error('OAuth 토큰을 받지 못했습니다.');
    }

    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) throw error;
  };

  const getCurrentUser = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw new Error('로그인된 사용자를 찾을 수 없습니다.');
    }

    return data.user;
  };

  const fetchExistingProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    return data;
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
      trust_level: 0,
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
      setProfileSetupRequired(false);
      return true;
    }

    const metadataProfileInput = getProfileInputFromMetadata(currentUser);

    if (metadataProfileInput) {
      await saveProfile(metadataProfileInput, currentUser);
      setProfileSetupRequired(false);
      return true;
    }

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

      setProfileSetupRequired(false);
      goNext();
    } catch (e: any) {
      setMessage(e?.message || '프로필을 저장하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleKakaoLogin = async () => {
    if (authMode === 'signup' && !validateProfileInput()) return;

    try {
      setLoading(true);
      setMessage('');

      const redirectTo =
  Platform.OS === 'web'
    ? Linking.createURL('/auth/callback')
    : 'interiormarket://auth/callback';

      console.log('redirectTo:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('카카오 로그인 URL을 받지 못했습니다.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      console.log('auth result:', result);

      if (result.type !== 'success') {
        setMessage('카카오 로그인이 완료되지 않았습니다.');
        return;
      }

      await createSessionFromUrl(result.url);
      const profileReady = await ensureProfileAfterLogin();

      if (profileReady) {
        goNext();
      }
    } catch (e: any) {
      console.log('카카오 로그인 오류:', e);
      setMessage(e?.message || '카카오 로그인 중 오류가 발생했습니다.');
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
      setMessage(e?.message || '이메일 로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>로그인 / 회원가입</Text>

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
          <TouchableOpacity style={styles.kakaoBtn} onPress={handleKakaoLogin} disabled={loading}>
            <Text style={styles.kakaoText}>{loading ? '처리 중...' : '카카오로 시작하기'}</Text>
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

  message: {
    color: '#dc2626',
    fontWeight: '600',
    lineHeight: 20,
  },
});
