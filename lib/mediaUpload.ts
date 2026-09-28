import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';
import { getMediaFormat, validateMediaSize } from './mediaAttachments';
import { supabase } from './supabase';

export async function validateMediaAsset(asset: ImagePickerAsset) {
  const format = getMediaFormat(asset);
  const size = Platform.OS === 'web'
    ? asset.file?.size ?? asset.fileSize
    : new File(asset.uri).size;
  if (size != null) validateMediaSize(format.kind, size);
  return format;
}

export async function uploadMediaAsset(bucket: 'estimate-images' | 'chat-images', pathWithoutExtension: string, asset: ImagePickerAsset) {
  const format = await validateMediaAsset(asset);
  // RN의 Blob/base64 변환을 피하고 실제 파일 크기를 먼저 검사해 큰 영상의 메모리 사용을 제한한다.
  let body: Blob | ArrayBuffer;
  if (Platform.OS === 'web') {
    if (asset.file) {
      body = asset.file;
    } else {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('첨부파일을 읽지 못했습니다.');
      body = await response.blob();
    }
    validateMediaSize(format.kind, body.size);
  } else {
    body = await new File(asset.uri).arrayBuffer();
    validateMediaSize(format.kind, body.byteLength);
  }
  const path = `${pathWithoutExtension}.${format.extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: format.contentType,
    upsert: false,
  });
  if (error) throw error;
  return { path, url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl, ...format };
}

export async function removeUploadedMedia(bucket: 'estimate-images' | 'chat-images', paths: string[]) {
  if (!paths.length) return;
  // INSERT가 실패했을 때만 실행한다. 기존 Storage DELETE 권한은 변경하지 않는다.
  try { await supabase.storage.from(bucket).remove(paths); } catch { /* 다음 전송은 새 경로를 사용한다. */ }
}
