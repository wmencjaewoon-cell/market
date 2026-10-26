import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { AS_MEDIA_BUCKET } from '../_shared/asAnalysis.ts';
import { deleteProviderFiles } from '../_shared/asGemini.ts';

async function matchesSecret(provided: string, expected: string): Promise<boolean> {
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const left = await digest(provided); const right = await digest(expected);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const expected = Deno.env.get('AS_AI_CLEANUP_SECRET');
  if (!expected || expected.length < 32 || !await matchesSecret(req.headers.get('x-as-cleanup-secret') ?? '', expected)) return new Response('Unauthorized', { status: 401 });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return new Response('Service unavailable', { status: 503 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  try {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: unfinished, error: filesError } = await db.from('as_ai_analyses').select('id,provider_file_names')
      .neq('provider_file_names', '{}').or(`processing_started_at.is.null,processing_started_at.lt.${cutoff}`).limit(3);
    if (filesError) throw filesError;
    const key = Deno.env.get('GEMINI_API_KEY');
    if (key) for (const row of unfinished ?? []) {
      const remaining = await deleteProviderFiles(key, row.provider_file_names);
      const { error } = await db.from('as_ai_analyses').update({ provider_file_names: remaining }).eq('id', row.id)
        .or(`processing_started_at.is.null,processing_started_at.lt.${cutoff}`);
      if (error) throw error;
    }
    let removedFiles = 0;
    for (let batch = 0; batch < 4; batch += 1) {
      const { data: expired, error } = await db.rpc('as_ai_expired_media');
      if (error) throw error;
      const paths = (expired ?? []).map((item: { path: string }) => item.path);
      if (!paths.length) break;
      const { error: removeError } = await db.storage.from(AS_MEDIA_BUCKET).remove(paths);
      if (removeError) throw removeError;
      const { error: metadataError } = await db.from('as_ai_media').delete().in('path', paths);
      if (metadataError) throw metadataError;
      removedFiles += paths.length;
    }
    const { data: removedAnalyses, error } = await db.rpc('purge_expired_as_ai_analyses');
    if (error) throw error;
    return Response.json({ removed_files: removedFiles, removed_analyses: removedAnalyses });
  } catch {
    return Response.json({ error: 'Retention cleanup failed; retry the scheduled job.' }, { status: 500 });
  }
});
