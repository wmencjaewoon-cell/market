// 프로필 이미지 URL 헬퍼: Supabase Storage path와 외부 URL을 화면용 URL로 통일한다.
import { supabase } from './supabase';

export function getProfileImageUrl(avatarPath?: string | null) {
  if (!avatarPath) return null;

  if (/^https?:\/\//.test(avatarPath)) {
    return avatarPath;
  }

  const { data } = supabase.storage.from('profile-images').getPublicUrl(avatarPath);
  return data.publicUrl;
}
