const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function harness(invoke) {
  const filename = path.resolve(__dirname, '../lib/asAnalysis.ts');
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = new Module(filename, module);
  loaded.require = name => {
    if (name === './supabase') return { supabase: { functions: { invoke } } };
    if (name === './mediaUpload') return {};
    if (name === '../supabase/functions/_shared/asAnalysis') return {};
    throw new Error(`Unexpected runtime import: ${name}`);
  };
  loaded._compile(compiled.outputText, filename);
  return loaded.exports;
}

test('client preserves structured failure codes and only expires retry-limited or expired IDs', async () => {
  for (const code of ['ANALYSIS_RETRY_LIMIT', 'ANALYSIS_EXPIRED', 'ANALYSIS_DAILY_LIMIT', 'ANALYSIS_RATE_LIMIT', 'ANALYSIS_LEASE_EXPIRED', 'ANALYSIS_BUSY', 'GEMINI_ANALYZE_503_UNAVAILABLE']) {
    let calls = 0;
    const client = harness(async () => {
      calls++;
      return { error: { context: Response.json({ code, error: '테스트 오류' }, { status: 409 }) } };
    });
    await assert.rejects(client.getAnalysisStatus('test-id'), error => {
      assert.ok(error instanceof client.AsAnalysisRequestError);
      assert.equal(error.code, code);
      assert.equal(error.needsNewAnalysis, ['ANALYSIS_RETRY_LIMIT', 'ANALYSIS_EXPIRED'].includes(code));
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('legacy retry-limit messages are recognized but explicit codes take priority', () => {
  const { AsAnalysisRequestError } = harness(async () => { throw new Error('No request expected'); });
  for (const message of ['이 분석의 재시도 횟수를 초과했습니다. 새 분석이나 상담을 요청해 주세요.', '첨부 대기 시간이 지났습니다. 새 분석을 시작해 주세요.']) {
    assert.equal(new AsAnalysisRequestError(message).needsNewAnalysis, true);
    assert.equal(new AsAnalysisRequestError(message, 'ANALYSIS_DAILY_LIMIT').needsNewAnalysis, false);
  }
  assert.equal(new AsAnalysisRequestError('AI 사전 분석은 24시간 동안 최대 5회 이용할 수 있습니다.').needsNewAnalysis, false);
});

test('malformed gateway errors remain retryable without inventing a fresh ID', async () => {
  for (const body of ['<html>gateway error</html>', 'null', '{"error": {}, "code": []}']) {
    const client = harness(async () => ({ error: { context: new Response(body, { status: 502 }) } }));
    await assert.rejects(client.getAnalysisStatus('test-id'), error => {
      assert.ok(error instanceof client.AsAnalysisRequestError);
      assert.equal(error.needsNewAnalysis, false);
      assert.match(error.message, /AI 분석 서버에 연결하지 못했습니다/);
      return true;
    });
  }
});

test('error payloads returned without an HTTP error still preserve their code', async () => {
  const client = harness(async () => ({ data: { code: 'ANALYSIS_RETRY_LIMIT', error: '새 분석이 필요합니다.' }, error: null }));
  await assert.rejects(client.getAnalysisStatus('test-id'), error => error.needsNewAnalysis && error.code === 'ANALYSIS_RETRY_LIMIT');
});
