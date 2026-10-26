import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  AS_MEDIA_BUCKET, AS_MIME_EXTENSIONS, applyAsSafetyPolicy, inputSafetyResult, parseAnalysisInput,
  type AsAnalysisRecord, type AsGuide,
} from '../_shared/asAnalysis.ts';
// import { AsGemini, GeminiRequestError, deleteProviderFiles, mediaSignatureMatches, type ProviderFile } from '../_shared/asGemini.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function publicRecord(row: AsAnalysisRecord) {
  return { id: row.id, status: row.status, result: row.result, error_message: row.error_message, created_at: row.created_at };
}
function databaseFailure(message: string) {
  const messages = {
    ANALYSIS_DAILY_LIMIT: '최근 24시간 동안 분석 답변 5회를 모두 이용했습니다. 실패한 분석은 횟수에 포함되지 않습니다.',
    ANALYSIS_RATE_LIMIT: '요청이 너무 빠르게 이어지고 있습니다. 잠시 후 다시 시도해 주세요. 실패한 분석은 이용 횟수에 포함되지 않습니다.',
    ANALYSIS_BUSY: '이미 분석 중입니다. 잠시 후 결과 확인을 눌러 주세요.',
    ANALYSIS_RETRY_LIMIT: '이 분석의 재시도 횟수를 초과했습니다. 새 분석이나 상담을 요청해 주세요.',
    ANALYSIS_EXPIRED: '첨부 대기 시간이 지났습니다. 새 분석을 시작해 주세요.',
    ANALYSIS_LEASE_EXPIRED: '분석 대기 시간이 초과되었습니다. 결과를 확인하거나 다시 시도해 주세요.',
  };
  for (const [code, error] of Object.entries(messages)) {
    if (message.includes(code)) return { code, error };
  }
  return { code: 'AS_AI_DATABASE_ERROR', error: '분석 기록을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
}
class AnalysisDatabaseError extends Error {
  constructor(readonly failure: ReturnType<typeof databaseFailure>) { super(failure.error); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: '분석 서버 설정이 필요합니다.' }, 503);
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, 401);
  const viewer = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: authError } = await viewer.auth.getUser();
  if (authError || !user) return json({ error: '로그인 상태를 확인해 주세요.' }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await db.from('profiles').select('status,role').eq('id', user.id).maybeSingle();
  if (profileError || !profile || ['blocked', 'deletion_pending'].includes(profile.status)) return json({ error: '이 계정은 분석을 이용할 수 없습니다.' }, 403);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 20000) return json({ error: '요청이 너무 큽니다.' }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch { return json({ error: '잘못된 분석 요청입니다.' }, 400); }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!uuid.test(id)) return json({ error: '분석 번호가 올바르지 않습니다.' }, 400);

  if (body.action === 'status') {
    const { data, error } = await db.from('as_ai_analyses').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (error || !data) return json({ error: '분석 기록을 찾을 수 없습니다.' }, 404);
    return json({ analysis: publicRecord(data) });
  }
  // Default to an admin-only pilot. A forged client role cannot reserve quota or execute
  // an existing job; only a deliberate server setting opens analysis to ordinary users.
  if (Deno.env.get('AS_AI_ACCESS_MODE') !== 'public' && profile.role !== 'admin') {
    return json({ code: 'AS_AI_ADMIN_ONLY', error: 'AI 답변은 현재 관리자 테스트 중입니다. 답변 없이 상담을 요청해 주세요.' }, 403);
  }
  // const key = Deno.env.get('GEMINI_API_KEY');
  // const model = Deno.env.get('AS_AI_MODEL');
  const backendUrl =
  Deno.env.get('AS_AI_BACKEND_URL');

const backendSecret =
  Deno.env.get(
    'AS_AI_BACKEND_SECRET'
  );

const model =
  Deno.env.get('AS_AI_MODEL')
  || 'qwen3-vl:8b-instruct';


  // if (Deno.env.get('AS_AI_ENABLED') !== 'true' || !key || !model || !/^[a-zA-Z0-9._-]+$/.test(model)) {
  //   return json({ code: 'AS_AI_UNAVAILABLE', error: 'AI 분석은 아직 준비 중입니다. 아래에서 바로 상담을 요청할 수 있습니다.' }, 503);
  // }

  if (
  Deno.env.get('AS_AI_ENABLED')
    !== 'true'
  || !backendUrl
  || !backendSecret
) {
  return json(
    {
      code: 'AS_AI_UNAVAILABLE',
      error:
        'AI 분석 서버가 아직 준비되지 않았습니다.'
    },
    503
  );
}

  if (body.action === 'prepare') {
    let input;
    try { input = parseAnalysisInput(body.input); }
    catch (error) { return json({ error: (error as Error).message }, 400); }
    const media = input.media.map((spec, index) => ({ ...spec, path: `${user.id}/${id}/${index}.${AS_MIME_EXTENSIONS[spec.mime_type]}` }));
    const { data, error } = await db.rpc('reserve_as_ai_analysis', { p_id: id, p_user_id: user.id, p_input: input, p_media: media });
    if (error) return json(databaseFailure(error.message), error.message.includes('LIMIT') ? 429 : 409);
    // Reject exhausted drafts before the client uploads into an expired storage
    // policy. The atomic claim RPC still enforces limits if state changes later.
    if (data.status !== 'completed' && data.status !== 'processing') {
      if (data.attempts >= 2) return json(databaseFailure('ANALYSIS_RETRY_LIMIT'), 409);
      if (Date.parse(data.created_at) < Date.now() - 86400000) return json(databaseFailure('ANALYSIS_EXPIRED'), 409);
    }
    return json({ analysis: publicRecord(data), media });
  }
  if (body.action !== 'analyze') return json({ error: '지원하지 않는 요청입니다.' }, 400);

  const lease = crypto.randomUUID();
  const { data: row, error: claimError } = await db.rpc('claim_as_ai_analysis', { p_id: id, p_user_id: user.id, p_lease: lease });
  if (claimError) return json(databaseFailure(claimError.message), /ANALYSIS_(DAILY|RATE)_LIMIT/.test(claimError.message) ? 429 : 409);
  if (row.status === 'completed') return json({ analysis: publicRecord(row) });
  const controller = new AbortController();
  // Bounded synchronous work, not a detached task that disappears with the Edge worker.
  const timeout = setTimeout(() => controller.abort(), 105000);
  let providerNames: string[] = row.provider_file_names ?? [];
  try {
    const input = parseAnalysisInput(row.input_payload);
    let result = inputSafetyResult(input);
    if (!result) {
      const { data: media, error: mediaError } = await db.from('as_ai_media').select('*').eq('analysis_id', id).order('sort_order');
      if (mediaError || media?.length !== input.media.length) throw new Error('첨부 정보가 불완전합니다. 다시 분석해 주세요.');
      const { data: guides, error: guidesError } = await db.from('as_repair_guides').select('*').eq('status', 'published').not('reviewed_at', 'is', null).not('reviewed_by', 'is', null);
      if (guidesError) throw new Error('검수된 가이드를 확인하지 못했습니다. 상담으로 확인해 주세요.');
      const provider = new AsGemini(key, model, controller.signal);
      const files: ProviderFile[] = [];
      for (const item of media) {
        controller.signal.throwIfAborted();
        // Signed URLs are created only for the frozen, owned manifest. No caller-supplied URL is fetched.
        const { data: signed, error: signError } = await db.storage.from(AS_MEDIA_BUCKET).createSignedUrl(item.path, 120);
        if (signError || !signed?.signedUrl) throw new Error('첨부 업로드가 완료되지 않았습니다. 다시 시도해 주세요.');
        const downloaded = await fetch(signed.signedUrl, { signal: controller.signal });
        if (!downloaded.ok) throw new Error('첨부파일을 불러오지 못했습니다. 다시 시도해 주세요.');
        const blob = await downloaded.blob();
        if (blob.size !== item.bytes || !mediaSignatureMatches(new Uint8Array(await blob.slice(0, 64).arrayBuffer()), item.mime_type)) {
          throw new Error('첨부파일의 실제 크기나 형식이 다릅니다. 파일을 다시 선택해 주세요.');
        }
        files.push(await provider.upload(blob, item.mime_type, async file => {
          providerNames.push(file.name);
          const { error } = await db.from('as_ai_analyses').update({ provider_file_names: providerNames }).eq('id', id).eq('lease_id', lease);
          if (error) throw new Error('첨부 처리 상태를 저장하지 못했습니다.');
        }));
      }
      const raw = await provider.analyze(input, files, guides as AsGuide[]);
      result = applyAsSafetyPolicy(input, raw, guides as AsGuide[]);
    }
    const { data: saved, error: saveError } = await db.rpc('complete_as_ai_analysis', {
      p_id: id, p_user_id: user.id, p_lease: lease, p_result: result, p_model: result.source === 'ai' ? model : null,
    });
    if (saveError) throw new AnalysisDatabaseError(databaseFailure(saveError.message));
    if (!saved) throw new Error('분석 결과를 저장하지 못했습니다. 결과 확인을 눌러 주세요.');
    return json({ analysis: publicRecord(saved) });
  } catch (error) {
    if (error instanceof GeminiRequestError) {
      // Deliberately exclude keys, prompts, file URLs and raw provider responses.
      console.error('AS Gemini request failed', { code: error.code, stage: error.stage, http_status: error.httpStatus });
    }
    const message = controller.signal.aborted ? '분석 시간이 초과되었습니다. 잠시 후 다시 시도하거나 상담을 요청해 주세요.'
      : error instanceof Error ? error.message : '분석에 실패했습니다. 다시 시도해 주세요.';
    await db.from('as_ai_analyses').update({ status: 'failed', error_message: message.slice(0, 500) }).eq('id', id).eq('lease_id', lease).neq('status', 'completed');
    if (error instanceof AnalysisDatabaseError) {
      return json(error.failure, /ANALYSIS_(DAILY|RATE)_LIMIT/.test(error.failure.code) ? 429 : 409);
    }
    return json({ error: message, ...(error instanceof GeminiRequestError ? { code: error.code } : {}) }, 502);
  } finally {
    clearTimeout(timeout);
    const remaining = await deleteProviderFiles(key, providerNames);
    await db.from('as_ai_analyses').update({ provider_file_names: remaining }).eq('id', id).eq('lease_id', lease);
  }
});
