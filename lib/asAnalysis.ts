import type { ImagePickerAsset } from 'expo-image-picker';
import { AS_MEDIA_BUCKET, parseAnalysisInput, type AsAnalysisInput, type AsAnalysisRecord, type AsMediaSpec } from '../supabase/functions/_shared/asAnalysis';
import { readMediaAsset, uploadMediaAsset } from './mediaUpload';
import { supabase } from './supabase';

export * from '../supabase/functions/_shared/asAnalysis';

export class AsAnalysisRequestError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = 'AsAnalysisRequestError';
  }

  get needsNewAnalysis(): boolean {
    if (this.code) return this.code === 'ANALYSIS_RETRY_LIMIT' || this.code === 'ANALYSIS_EXPIRED';
    // Older deployed functions returned only these messages. Do not reset IDs
    // for quota, in-flight requests or ambiguous network failures.
    return this.message.startsWith('이 분석의 재시도 횟수를 초과했습니다.') || this.message.startsWith('첨부 대기 시간이 지났습니다.');
  }
}

function analysisRequestError(payload: unknown, fallback: string): AsAnalysisRequestError {
  const data = payload as { error?: unknown; code?: unknown } | null;
  return new AsAnalysisRequestError(
    typeof data?.error === 'string' && data.error ? data.error : fallback,
    typeof data?.code === 'string' ? data.code : null,
  );
}

async function invokeAnalysis(body: Record<string, unknown>) {
  // AbortController works on Hermes as well as web; avoid depending on AbortSignal.timeout in native runtimes.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 130000);
  let response;
  try { response = await supabase.functions.invoke('analyze-as-issue', { body, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
  const { data, error } = response;
  if (error) {
    let payload: unknown;
    if (error.context instanceof Response) {
      try { payload = await error.context.json(); } catch { /* Gateway responses need not be JSON. */ }
    }
    throw analysisRequestError(payload, 'AI 분석 서버에 연결하지 못했습니다. 잠시 후 다시 시도하거나 바로 상담을 요청해 주세요.');
  }
  if (data?.error || !data?.analysis) throw analysisRequestError(data, '분석 결과를 확인하지 못했습니다.');
  return data as { analysis: AsAnalysisRecord; media?: (AsMediaSpec & { path: string })[] };
}

export async function getAnalysisStatus(id: string) {
  return (await invokeAnalysis({ action: 'status', id })).analysis;
}

export async function clarifyAsAnalysis(options: {
  id: string;
  value: string;
  onProgress: (label: string) => void;
}): Promise<AsAnalysisRecord> {
  const value = options.value.trim();

  if (
    !/^[a-z0-9]+(?:_[a-z0-9]+)*$/
      .test(value)
  ) {
    throw new Error(
      '추가 확인 답변이 올바르지 않습니다.',
    );
  }

  /*
   * 현재 상태를 먼저 확인합니다.
   *
   * 최초 선택:
   * completed + needs_more_info
   * → clarify 실행
   *
   * clarify 성공 후 analyze가 실패한 경우:
   * uploading / failed
   * → clarify를 다시 하지 않고 analyze만 재시도
   */
  const current =
    await getAnalysisStatus(
      options.id,
    );

  if (
    current.status === 'completed'
    && current.result
    && current.result.recommended_action
      !== 'needs_more_info'
  ) {
    return current;
  }

  if (
    current.status === 'completed'
    && current.result?.recommended_action
      === 'needs_more_info'
  ) {
    options.onProgress(
      '추가 답변 반영 중...',
    );

    await invokeAnalysis({
      action:
        'clarify',

      id:
        options.id,

      value,
    });
  }

  options.onProgress(
    '추가 답변으로 최종 분석 중...',
  );

  return (
    await invokeAnalysis({
      action:
        'analyze',

      id:
        options.id,
    })
  ).analysis;
}

export async function runAsAnalysis(options: {
  id: string; input: Omit<AsAnalysisInput, 'media'>; assets: ImagePickerAsset[];
  onProgress: (label: string) => void;
}): Promise<AsAnalysisRecord> {
  const media: AsMediaSpec[] = [];
  for (const asset of options.assets) {
    const { format, bytes } = await readMediaAsset(asset);
    media.push({ mime_type: format.contentType, bytes, duration_seconds: format.kind === 'video' && asset.duration ? asset.duration / 1000 : null });
  }
  const input = parseAnalysisInput({ ...options.input, media });
  options.onProgress('분석 준비 중...');
  const prepared = await invokeAnalysis({ action: 'prepare', id: options.id, input });
  if (prepared.analysis.status === 'completed') return prepared.analysis;
  if (prepared.analysis.status !== 'processing') {
    if (prepared.media?.length !== options.assets.length) throw new Error('첨부 준비에 실패했습니다. 다시 시도해 주세요.');
    for (let index = 0; index < options.assets.length; index += 1) {
      options.onProgress(`비공개 첨부 업로드 ${index + 1}/${options.assets.length}`);
      const path = prepared.media[index].path;
      try { await uploadMediaAsset(AS_MEDIA_BUCKET, path.slice(0, path.lastIndexOf('.')), options.assets[index]); }
      catch (error) {
        // A retry reuses immutable manifest objects; only an actual duplicate is safe to skip.
        const storageError = error as { statusCode?: string; message?: string };
        if (String(storageError.statusCode) !== '409' && storageError.message !== 'The resource already exists') throw error;
      }
    }
  }
  options.onProgress(options.assets.length ? '사진·영상과 증상 분석 중...' : '작성한 증상 분석 중...');
  return (await invokeAnalysis({ action: 'analyze', id: options.id })).analysis;
}
