import type { ImagePickerAsset } from 'expo-image-picker';

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 30 * 1024 * 1024;
export const VIDEO_MESSAGE_PREFIX = '[video:v1]\n';

const FORMATS: Record<string, { extension: string; contentType: string }> = {
  jpg: { extension: 'jpg', contentType: 'image/jpeg' },
  jpeg: { extension: 'jpg', contentType: 'image/jpeg' },
  png: { extension: 'png', contentType: 'image/png' },
  webp: { extension: 'webp', contentType: 'image/webp' },
  gif: { extension: 'gif', contentType: 'image/gif' },
  heic: { extension: 'heic', contentType: 'image/heic' },
  heif: { extension: 'heif', contentType: 'image/heif' },
  mp4: { extension: 'mp4', contentType: 'video/mp4' },
  mov: { extension: 'mov', contentType: 'video/quicktime' },
  m4v: { extension: 'm4v', contentType: 'video/x-m4v' },
  webm: { extension: 'webm', contentType: 'video/webm' },
};

export function isVideoAttachment(path: string) {
  return /\.(mp4|mov|m4v|webm)$/i.test(path.split(/[?#]/)[0]);
}

// 기존 estimate_request_images의 경로/정렬 구조를 유지한다. 새 파일은 실제 MIME에 맞는 확장자를 쓴다.
export function getMediaFormat(asset: ImagePickerAsset) {
  const mime = asset.mimeType?.toLowerCase().split(';')[0];
  const extension = (asset.fileName || asset.uri).split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  const format = Object.values(FORMATS).find((item) => item.contentType === mime)
    ?? (extension ? FORMATS[extension] : undefined);
  if (!format || (asset.type === 'video' && !format.contentType.startsWith('video/'))) {
    throw new Error('지원하지 않는 파일 형식입니다. 사진 또는 MP4, MOV, M4V, WebM 영상을 선택해 주세요.');
  }
  return { ...format, kind: format.contentType.startsWith('video/') ? 'video' as const : 'image' as const };
}

export function validateMediaSize(kind: 'image' | 'video', bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) throw new Error('첨부파일을 읽을 수 없습니다. 다시 선택해 주세요.');
  const max = kind === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (bytes > max) {
    throw new Error(kind === 'video' ? '영상은 파일당 30MB까지 첨부할 수 있습니다.' : '사진은 파일당 10MB까지 첨부할 수 있습니다.');
  }
}

export type VideoMessage = { url: string; name: string; duration?: number };

export function makeVideoMessage(video: VideoMessage) {
  return `${VIDEO_MESSAGE_PREFIX}${JSON.stringify(video)}`;
}

export function parseVideoMessage(message: string): VideoMessage | null {
  if (!message.startsWith(VIDEO_MESSAGE_PREFIX)) return null;
  try {
    const value = JSON.parse(message.slice(VIDEO_MESSAGE_PREFIX.length));
    if (!value || typeof value.url !== 'string' || !/^https?:\/\//i.test(value.url)) return null;
    return {
      url: value.url,
      name: typeof value.name === 'string' ? value.name.slice(0, 200) : '영상',
      duration: typeof value.duration === 'number' && Number.isFinite(value.duration) && value.duration > 0
        ? value.duration : undefined,
    };
  } catch {
    return null;
  }
}

export function formatVideoDuration(milliseconds?: number | null) {
  if (!milliseconds || !Number.isFinite(milliseconds) || milliseconds < 0) return '';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
