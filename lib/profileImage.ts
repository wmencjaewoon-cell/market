import { supabase } from './supabase';

export function getProfileImageUrl(avatarPath?: string | null) {
  if (!avatarPath) return null;

  if (/^https?:\/\//.test(avatarPath)) {
    return avatarPath;
  }

  const { data } = supabase.storage.from('profile-images').getPublicUrl(avatarPath);
  return data.publicUrl;
}
