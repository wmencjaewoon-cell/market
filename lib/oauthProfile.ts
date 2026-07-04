import type { User } from '@supabase/supabase-js';

type MetadataValue = string | number | boolean | null | undefined | MetadataObject;
type MetadataObject = {
  [key: string]: MetadataValue;
};

export type OAuthProfileDefaults = {
  provider: string | null;
  displayName: string;
  email: string;
  phone: string;
};

function asMetadataObject(value: unknown): MetadataObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as MetadataObject)
    : {};
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function pickString(metadata: MetadataObject, keys: string[]) {
  for (const key of keys) {
    const value = getString(metadata[key]);
    if (value) return value;
  }

  return '';
}

function compactPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const hasInternationalPrefix = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (!digits) return '';

  if (hasInternationalPrefix) return `+${digits}`;
  if (digits.startsWith('8210')) return `0${digits.slice(2)}`;
  return digits;
}

export function getOAuthProvider(user: User | null | undefined) {
  const appMetadata = asMetadataObject(user?.app_metadata);
  const provider = getString(appMetadata.provider);
  if (provider) return provider;

  const providers = Array.isArray(appMetadata.providers) ? appMetadata.providers : [];
  const firstProvider = providers.find((item) => typeof item === 'string');
  if (firstProvider) return firstProvider;

  const identityProvider = user?.identities?.find((identity) => identity.provider)?.provider;
  return identityProvider || null;
}

export function getOAuthProfileDefaults(user: User | null | undefined): OAuthProfileDefaults {
  const metadata = asMetadataObject(user?.user_metadata);
  const kakaoAccount = asMetadataObject(metadata.kakao_account);
  const naverResponse = asMetadataObject(metadata.response);

  const displayName =
    pickString(metadata, [
      'display_name',
      'name',
      'nickname',
      'full_name',
      'preferred_username',
    ]) ||
    pickString(kakaoAccount, ['name', 'profile_nickname']) ||
    pickString(naverResponse, ['name', 'nickname']);

  const email =
    pickString(metadata, ['email']) ||
    pickString(kakaoAccount, ['email']) ||
    pickString(naverResponse, ['email']) ||
    getString(user?.email);

  const rawPhone =
    pickString(metadata, ['phone', 'phone_number', 'mobile', 'phoneNumber']) ||
    pickString(kakaoAccount, ['phone_number']) ||
    pickString(naverResponse, ['mobile', 'phone']);

  return {
    provider: getOAuthProvider(user),
    displayName,
    email,
    phone: compactPhone(rawPhone),
  };
}
