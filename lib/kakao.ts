import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const KAKAO_AUTH_BASE = 'https://kauth.kakao.com/oauth/authorize';

export function getKakaoRedirectUri() {
  return Linking.createURL('oauth');
}

export function buildKakaoAuthUrl() {
  const clientId = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
  const redirectUri = getKakaoRedirectUri();

  if (!clientId) {
    throw new Error('EXPO_PUBLIC_KAKAO_REST_API_KEY is missing');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
  });

  return `${KAKAO_AUTH_BASE}?${params.toString()}`;
}

export async function startKakaoAuth() {
  const authUrl = buildKakaoAuthUrl();
  const redirectUri = getKakaoRedirectUri();

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

  return result;
}
