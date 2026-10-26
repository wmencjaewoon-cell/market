const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const cache = new Map();
function load(relative) {
  const filename = path.resolve(__dirname, '../supabase/functions/_shared', relative);
  if (cache.has(filename)) return cache.get(filename);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const loaded = new Module(filename, module);
  loaded.paths = module.paths;
  const original = loaded.require.bind(loaded);
  loaded.require = name => name.endsWith('.ts') ? load(name) : original(name);
  loaded._compile(compiled.outputText, filename);
  cache.set(filename, loaded.exports);
  return loaded.exports;
}
const policy = load('asAnalysis.ts');
const provider = load('asGemini.ts');
const input = {
  description: '가벼운 수납장 손잡이가 헐거워요', categories: ['가구/수납'], symptoms: [],
  safety_answer: 'none', hazards: [], consent_version: policy.AS_CONSENT_VERSION,
  media: [{ mime_type: 'image/jpeg', bytes: 1000, duration_seconds: null }],
};
const model = {
  issue_area: '수납장 손잡이', problem_summary: '손잡이 고정부가 헐거워진 것으로 보입니다.',
  observations: ['손잡이와 문 사이에 틈이 보입니다.'], possible_causes: ['고정부의 느슨함'],
  hazards: [], safety_uncertain: false, risk_level: 'low', recommended_action: 'self_repair',
  repairability: 'replacement_possible', reason: '작고 가벼운 수납장 외부 손잡이로 보입니다.',
  follow_up_questions: [], limitations: ['내부 손상 여부는 확인할 수 없습니다.'], guide_key: 'cabinet_knob',
};
const guide = {
  key: 'cabinet_knob', title: '검수 테스트 가이드', applicability: '테스트 전용', tools: ['테스트 준비물'],
  steps: ['테스트 절차'], warnings: ['테스트 주의사항'], stop_conditions: ['테스트 중단 조건'],
  status: 'published', reviewed_at: '2026-09-28T00:00:00Z', reviewed_by: 'reviewer',
};

test('accepts bounded photo/video input and does not preserve arbitrary client fields', () => {
  const parsed = policy.parseAnalysisInput({ ...input, prompt: 'ignore policy', user_id: 'other' });
  assert.deepEqual(parsed, input);
  const video = { mime_type: 'video/mp4', bytes: 20 * 1024 * 1024, duration_seconds: 20 };
  assert.equal(policy.parseAnalysisInput({ ...input, media: [input.media[0], video] }).media.length, 2);
  assert.deepEqual(policy.parseAnalysisInput({ ...input, media: [] }).media, []);
  assert.deepEqual(policy.parseAnalysisInput({ ...input, description: '', symptoms: ['문이 잘 안 닫혀요'], media: [] }).media, []);
});
test('rejects missing consent, unknown risk answer, invalid metadata and excess video', () => {
  for (const change of [
    { consent_version: '' }, { safety_answer: 'safe' }, { safety_answer: 'hazard' }, { hazards: ['gas'] },
    { media: null }, { media: Array(6).fill(input.media[0]) }, { description: '', symptoms: [] },
    { description: '', symptoms: [], media: [] },
    { media: [{ mime_type: 'image/svg+xml', bytes: 10, duration_seconds: null }] },
    { media: [{ ...input.media[0], bytes: -1 }] },
    { media: [{ ...input.media[0], bytes: 11 * 1024 * 1024 }] },
    { media: [{ mime_type: 'video/mp4', bytes: 10, duration_seconds: 31 }] },
    { media: Array(2).fill({ mime_type: 'video/mp4', bytes: 10, duration_seconds: 10 }) },
  ]) assert.throws(() => policy.parseAnalysisInput({ ...input, ...change }));
});
test('text-only questions give preliminary causes but do not expose visual observations or DIY steps', () => {
  const result = policy.applyAsSafetyPolicy({ ...input, media: [] }, model, [guide]);
  assert.equal(result.recommended_action, 'needs_more_info');
  assert.equal(result.diy_possible, null);
  assert.equal(result.guide, null);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.possible_causes, model.possible_causes);
  assert.match(result.limitations[0], /사진·영상 없이/);
  assert.equal(policy.applyAsSafetyPolicy({ ...input, media: [], description: '가스 냄새' }, model, [guide]).recommended_action, 'emergency');
});
test('all seven declared hazards suppress repair steps even if the model says safe', () => {
  for (const hazard of Object.keys(policy.AS_HAZARDS)) {
    const result = policy.applyAsSafetyPolicy({ ...input, safety_answer: 'hazard', hazards: [hazard] }, model, [guide]);
    assert.equal(result.diy_possible, false);
    assert.equal(result.recommended_action, 'expert_required');
    assert.equal(result.guide, null);
    assert.equal(result.source, 'safety_policy');
    assert.deepEqual(result.possible_causes, []);
  }
});
const faucetInput = { ...input, categories: ['누수/배관'], symptoms: ['물이 새요'], description: '화장실 세면대 수도꼭지에서 물이 샌다', media: [] };
const faucetModel = {
  ...model, issue_area: '세면대 수도꼭지', problem_summary: '수도꼭지에서 물이 샌다고 설명했습니다.',
  observations: [], possible_causes: ['수전 부품의 마모 가능성'], recommended_action: 'needs_more_info',
  risk_level: 'unknown', safety_uncertain: true, reason: '누수 위치와 정도를 추가로 확인해야 합니다.', guide_key: null,
};
test('water symptom, common misspelling and ordinary faucet descriptions do not trigger the lexical risk gate', () => {
  for (const description of ['', '물', '물이 새요', '물이 세요', '화장실 세면대 수도꼭지에서 물이 샌다', '수도꼭지에서 물이 한 방울씩 떨어져요', '싱크대 수전에서 물이 새요']) {
    for (const category of ['간단 AS', '누수/배관', '타일/욕실']) {
      assert.equal(policy.inputSafetyResult({ ...faucetInput, description, categories: [category] }), null, `${category}: ${description}`);
    }
  }
});
test('unanswered safety questions do not turn an ordinary faucet question into a high-risk or emergency finding', () => {
  for (const question of [
    '주변 콘센트에 물이 닿았나요?', '전기 제품 주변도 젖었나요?', '벽 내부 배관에서도 누수가 의심되나요?',
    '천장에서 물이 떨어지나요?', '침수가 발생했나요?', '보일러 쪽에서도 증상이 있나요?',
    '가스 냄새가 나나요?', '연기가 보이나요?', '감전된 사람이 있나요?', '기둥에 균열이 있나요?',
  ]) {
    for (const media of [[], input.media, [{ mime_type: 'video/mp4', bytes: 1000, duration_seconds: 10 }]]) {
      const result = policy.applyAsSafetyPolicy({ ...faucetInput, media }, { ...faucetModel, follow_up_questions: [question] }, []);
      assert.equal(result.recommended_action, 'needs_more_info', question);
      assert.equal(result.risk_level, 'unknown');
      assert.deepEqual(result.hazards, []);
      assert.deepEqual(result.possible_causes, faucetModel.possible_causes);
      assert.deepEqual(result.follow_up_questions, [question]);
      assert.equal(result.diy_possible, null);
      assert.equal(result.expert_required, null);
      assert.equal(result.guide, null);
    }
  }
});
test('safety questions still withhold a reviewed DIY guide even when the model incorrectly claims safety', () => {
  const result = policy.applyAsSafetyPolicy(input, { ...model, follow_up_questions: ['주변 콘센트에 물이 닿았나요?'] }, [guide]);
  assert.equal(result.recommended_action, 'needs_more_info');
  assert.equal(result.safety_uncertain, true);
  assert.equal(result.risk_level, 'unknown');
  assert.equal(result.diy_possible, null);
  assert.equal(result.guide, null);
  const ordinaryQuestion = policy.applyAsSafetyPolicy(input, { ...model, follow_up_questions: ['언제부터 헐거워졌나요?'] }, [guide]);
  assert.equal(ordinaryQuestion.recommended_action, 'self_repair');
});
test('water near actual hazards remains blocked regardless of an ordinary water symptom', () => {
  for (const description of [
    '물이 새서 콘센트가 젖었어요', '벽 내부 배관에서 물이 새요', '천장에서 물이 떨어져요',
    '물이 쏟아져 침수됐어요', '보일러에서 물이 새요', '물이 새고 누전이 의심돼요',
  ]) {
    const result = policy.applyAsSafetyPolicy({ ...faucetInput, description }, faucetModel, []);
    assert.equal(result.recommended_action, 'expert_required', description);
    assert.equal(result.risk_level, 'high');
    assert.equal(result.diy_possible, false);
    assert.equal(result.guide, null);
  }
});
test('reported model hazards and high-risk findings take precedence over unanswered questions', () => {
  for (const change of [
    { hazards: ['electrical'] }, { risk_level: 'high' },
    { observations: ['콘센트 주변이 젖은 흔적이 보입니다.'] },
    { possible_causes: ['벽 내부 배관 누수 가능성'] },
    { issue_area: '천장', observations: ['누수 흔적이 보입니다.'] },
  ]) {
    const result = policy.applyAsSafetyPolicy({ ...faucetInput, media: input.media }, { ...faucetModel, ...change, follow_up_questions: ['주변 콘센트에 물이 닿았나요?'] }, []);
    assert.equal(result.recommended_action, 'expert_required');
    assert.equal(result.risk_level, 'high');
    assert.equal(result.diy_possible, false);
  }
  for (const change of [{ recommended_action: 'emergency' }, { observations: ['콘센트에서 불꽃이 보입니다.'] }]) {
    const result = policy.applyAsSafetyPolicy(faucetInput, { ...faucetModel, ...change, follow_up_questions: ['물이 얼마나 새나요?'] }, []);
    assert.equal(result.recommended_action, 'emergency');
    assert.equal(result.diy_possible, false);
  }
});
test('removing questions from hazard evidence does not remove the instruction and link guard', () => {
  for (const question of ['콘센트를 분해해 볼 수 있나요?', '나사를 풀어 볼 수 있나요?', 'https://untrusted.invalid를 보셨나요?']) {
    assert.throws(() => policy.applyAsSafetyPolicy(faucetInput, { ...faucetModel, follow_up_questions: [question] }, []), /안전 기준/);
  }
});
test('written hazardous symptoms override an explicit no-risk answer', () => {
  for (const description of ['콘센트 고장', '가스 밸브 문제', '누전 문제', '벽 내부 배관', '기둥 균열', '천장 누수', '보일러 부품']) {
    assert.equal(policy.applyAsSafetyPolicy({ ...input, description }, model, [guide]).diy_possible, false);
  }
});
test('emergency signs do not become an ordinary consultation or DIY result', () => {
  for (const description of ['가스 냄새가 나요', '연기가 나요', '감전됐어요', '천장이 무너져요']) {
    const result = policy.applyAsSafetyPolicy({ ...input, description }, model, [guide]);
    assert.equal(result.recommended_action, 'emergency');
    assert.match(result.safety_warning, /119/);
    assert.equal(result.guide, null);
  }
});
test('hazards recognized in actual media override a safe written description', () => {
  const result = policy.applyAsSafetyPolicy(input, { ...model, hazards: ['hidden_pipe'] }, [guide]);
  assert.equal(result.recommended_action, 'expert_required');
  assert.equal(result.source, 'ai');
  assert.equal(result.guide, null);
});
test('uncertain user answer, missing risk evidence, or unknown risk never enables DIY', () => {
  for (const [userInput, raw] of [[{ ...input, safety_answer: 'unsure' }, model], [input, { ...model, safety_uncertain: true }], [input, { ...model, risk_level: 'unknown' }]]) {
    const result = policy.applyAsSafetyPolicy(userInput, raw, [guide]);
    assert.equal(result.recommended_action, 'needs_more_info');
    assert.equal(result.diy_possible, null);
    assert.equal(result.guide, null);
  }
});
test('published, reviewed, matching guide is required; model-supplied procedures are discarded', () => {
  const result = policy.applyAsSafetyPolicy(input, { ...model, steps: ['malicious model step'], tools_needed: ['model tool'] }, [guide]);
  assert.equal(result.recommended_action, 'self_repair');
  assert.equal(result.diy_possible, true);
  assert.deepEqual(result.guide.steps, guide.steps);
  assert.equal('steps' in result, false);
  for (const guides of [[], [{ ...guide, status: 'draft' }], [{ ...guide, reviewed_by: null }], [{ ...guide, key: 'furniture_felt_pad' }]]) {
    const rejected = policy.applyAsSafetyPolicy(input, model, guides);
    assert.equal(rejected.recommended_action, 'needs_more_info');
    assert.equal(rejected.guide, null);
    assert.equal(rejected.guide_pending_review, true);
  }
});
test('complex work and medium-risk work do not expose repair steps', () => {
  for (const changes of [{ recommended_action: 'complex' }, { risk_level: 'medium' }]) {
    const result = policy.applyAsSafetyPolicy(input, { ...model, ...changes }, [guide]);
    assert.equal(result.recommended_action, 'complex');
    assert.equal(result.guide, null);
  }
});
test('malformed model JSON and narrative repair instructions fail closed', () => {
  for (const raw of [null, {}, { ...model, safety_uncertain: 'false' }, { ...model, risk_level: 'certain' }, { ...model, guide_key: 'electric_repair' }, { ...model, problem_summary: '나사를 풀어 보세요.' }]) {
    assert.throws(() => policy.applyAsSafetyPolicy(input, raw, [guide]));
  }
});
test('file signature checks reject forged content type and support known image/video containers', () => {
  assert.ok(provider.mediaSignatureMatches(Uint8Array.from([255, 216, 255, 0]), 'image/jpeg'));
  assert.ok(provider.mediaSignatureMatches(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'));
  assert.ok(provider.mediaSignatureMatches(Buffer.from('\0\0\0\x18ftypisom'), 'video/mp4'));
  assert.ok(provider.mediaSignatureMatches(Buffer.from('\0\0\0\x18ftypheic'), 'image/heic'));
  assert.equal(provider.mediaSignatureMatches(Buffer.from('<script>'), 'image/jpeg'), false);
  assert.equal(provider.mediaSignatureMatches(Buffer.from('\0\0\0\x18ftypheic'), 'video/mp4'), false);
});
test('only completed model output text is parsed, never hidden thought or tool output', () => {
  assert.equal(provider.getInteractionText({ status: 'completed', steps: [{ type: 'thought', content: [{ type: 'text', text: 'hidden' }] }, { type: 'model_output', content: [{ type: 'text', text: '{"ok":true}' }] }] }), '{"ok":true}');
  assert.throws(() => provider.getInteractionText({ status: 'failed', output_text: '{}' }));
});
test('provider receives actual video file URI with structured schema and no server-side conversation storage', async () => {
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ url, init });
    return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(model) }] }] });
  };
  const client = new provider.AsGemini('test-key', 'test-model', new AbortController().signal, fakeFetch);
  await client.analyze(input, [{ name: 'files/abc', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc', mimeType: 'video/mp4' }], [guide]);
  const sent = JSON.parse(requests[0].init.body);
  assert.equal(sent.store, false);
  assert.equal(sent.input[0].type, 'video');
  assert.match(sent.input[0].uri, /files\/abc$/);
  assert.equal(sent.response_format.mime_type, 'application/json');
  assert.equal(sent.tools, undefined);
  assert.ok(!sent.input.at(-1).text.includes('applicant_phone'));
  assert.match(sent.system_instruction, /Ordinary water\/leak words/);
  assert.match(sent.system_instruction, /Separate evidence from unanswered safety questions/);
});
test('text-only provider call has no file parts and explicitly forbids imaginary visual evidence', async () => {
  let sent;
  const client = new provider.AsGemini('test-key', 'test-model', new AbortController().signal, async (_url, init) => {
    sent = JSON.parse(init.body);
    return Response.json({ status: 'completed', output_text: JSON.stringify(model) });
  });
  await client.analyze({ ...input, media: [] }, [], []);
  assert.equal(sent.input.length, 1);
  assert.equal(sent.input[0].type, 'text');
  assert.match(sent.system_instruction, /TEXT-ONLY/);
  assert.match(sent.system_instruction, /observations=\[\]/);
});
test('provider failures expose fixed codes without leaks and only 503 gets bounded retries', async () => {
  const cases = [
    [400, 'API_KEY_INVALID', 'key_invalid'], [400, 'API_KEY_EXPIRED', 'key_invalid'],
    [401, '', 'key_invalid'], [403, '', 'permission'], [402, '', 'billing'],
    [404, '', 'model'], [400, '', 'request'], [422, '', 'request'],
    [429, '', 'quota'], [500, '', 'unavailable'], [503, '', 'unavailable'],
    [418, 'UNKNOWN_SECRET_REASON', 'unknown'],
  ];
  for (const [status, reason, category] of cases) {
    let requests = 0;
    const client = new provider.AsGemini('private-api-key', 'test-model', new AbortController().signal, async () => {
      requests++;
      return Response.json({ error: { message: 'private-api-key customer-name symptom-text', details: [
        { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, metadata: { consumer: 'private-project-id' } },
      ] } }, { status });
    }, async () => {});
    await assert.rejects(client.analyze({ ...input, media: [] }, [], []), error => {
      assert.ok(error instanceof provider.GeminiRequestError);
      assert.equal(error.code, `GEMINI_ANALYZE_${status}_${category.toUpperCase()}`);
      assert.equal(error.httpStatus, status);
      assert.doesNotMatch(JSON.stringify(error) + error.message, /private-api-key|customer-name|symptom-text|private-project-id|UNKNOWN_SECRET_REASON/);
      return true;
    });
    assert.equal(requests, status === 503 ? 3 : 1, 'only a definitive 503 may retry, without switching models');
  }
});
test('known blocked-key and free-region errors are classified without echoing provider text', async () => {
  for (const [status, message, category] of [
    [403, 'Your API key was reported as leaked. private-value', 'KEY_BLOCKED'],
    [400, 'API key not valid. private-value', 'KEY_INVALID'],
    [400, 'Gemini API free tier is not available in your country. private-value', 'REGION'],
  ]) {
    const client = new provider.AsGemini('key', 'model', new AbortController().signal, async () => Response.json({ error: { message } }, { status }));
    await assert.rejects(client.analyze({ ...input, media: [] }, [], []), error => {
      assert.equal(error.code, `GEMINI_ANALYZE_${status}_${category}`);
      assert.doesNotMatch(error.message, /private-value/);
      return true;
    });
  }
});
test('HTML/malformed error responses and transport exceptions remain sanitized', async () => {
  for (const payload of ['<html>private-response</html>', 'null', '{"error":{"details":[null]}}']) {
    const client = new provider.AsGemini('key', 'model', new AbortController().signal, async () => new Response(payload, { status: 503 }), async () => {});
    await assert.rejects(client.analyze({ ...input, media: [] }, [], []), /GEMINI_ANALYZE_503_UNAVAILABLE/);
  }
  const network = new provider.AsGemini('key', 'model', new AbortController().signal, async () => { throw new Error('private-url private-key'); });
  await assert.rejects(network.analyze({ ...input, media: [] }, [], []), error => {
    assert.equal(error.code, 'GEMINI_ANALYZE_NETWORK');
    assert.doesNotMatch(error.message, /private-url|private-key/);
    return true;
  });
  const malformed = new provider.AsGemini('key', 'model', new AbortController().signal, async () => new Response('private-invalid-json'));
  await assert.rejects(malformed.analyze({ ...input, media: [] }, [], []), /GEMINI_ANALYZE_200_RESPONSE/);
  const controller = new AbortController();
  controller.abort();
  const aborted = new provider.AsGemini('key', 'model', controller.signal, async () => { throw controller.signal.reason; });
  await assert.rejects(aborted.analyze({ ...input, media: [] }, [], []), error => error.name === 'AbortError');
});
test('503 recovery reuses the same model, input and privacy settings with exponential backoff', async () => {
  const requests = [];
  const pauses = [];
  const controller = new AbortController();
  const client = new provider.AsGemini('key', 'model', controller.signal, async (url, init) => {
    requests.push({ url, init });
    return requests.length < 3
      ? Response.json({ error: { code: 'service_unavailable' } }, { status: 503 })
      : Response.json({ status: 'completed', output_text: JSON.stringify(model) });
  }, async (milliseconds, signal) => {
    assert.equal(signal, controller.signal);
    pauses.push(milliseconds);
  });
  assert.deepEqual(await client.analyze({ ...input, media: [] }, [], []), model);
  assert.equal(requests.length, 3);
  assert.equal(pauses.length, 2);
  assert.ok(pauses[0] >= 1000 && pauses[0] < 1500);
  assert.ok(pauses[1] >= 2000 && pauses[1] < 2500);
  assert.ok(requests.every(request => request.url === requests[0].url && request.init.body === requests[0].init.body));
  const sent = JSON.parse(requests[2].init.body);
  assert.equal(sent.model, 'model');
  assert.equal(sent.store, false);
});
test('persistent 503 stops after three attempts, and a subsequent quota/configuration error stops immediately', async () => {
  for (const terminal of [503, 429, 400, 401, 403, 404]) {
    let attempts = 0;
    let pauses = 0;
    const client = new provider.AsGemini('key', 'model', new AbortController().signal, async () => {
      const status = ++attempts === 1 ? 503 : terminal;
      return Response.json({ error: { message: 'private-provider-response' } }, { status });
    }, async () => { pauses++; });
    await assert.rejects(client.analyze({ ...input, media: [] }, [], []), error => {
      assert.equal(error.httpStatus, terminal);
      assert.doesNotMatch(error.message, /private-provider-response/);
      return true;
    });
    assert.equal(attempts, terminal === 503 ? 3 : 2);
    assert.equal(pauses, attempts - 1);
  }
});
test('Retry-After is honored within the retry budget; longer delays are not shortened', async () => {
  for (const header of ['5', new Date(Date.now() + 8000).toUTCString(), '120', 'invalid']) {
    let attempts = 0;
    const pauses = [];
    const client = new provider.AsGemini('key', 'model', new AbortController().signal, async () => {
      attempts++;
      return attempts === 1
        ? Response.json({ error: {} }, { status: 503, headers: { 'Retry-After': header } })
        : Response.json({ status: 'completed', output_text: JSON.stringify(model) });
    }, async delay => { pauses.push(delay); });
    if (header === '120') {
      await assert.rejects(client.analyze({ ...input, media: [] }, [], []), /GEMINI_ANALYZE_503_UNAVAILABLE/);
      assert.equal(attempts, 1);
      assert.deepEqual(pauses, []);
    } else {
      await client.analyze({ ...input, media: [] }, [], []);
      assert.equal(attempts, 2);
      assert.equal(pauses.length, 1);
      if (header === '5') assert.equal(pauses[0], 5000);
      else if (header !== 'invalid') assert.ok(pauses[0] >= 6000 && pauses[0] <= 8000);
    }
  }
});
test('the existing abort deadline interrupts retry waits before another provider request', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const client = new provider.AsGemini('key', 'model', controller.signal, async () => {
    attempts++;
    setTimeout(() => controller.abort(), 10);
    return Response.json({ error: {} }, { status: 503 });
  });
  await assert.rejects(client.analyze({ ...input, media: [] }, [], []), error => error.name === 'AbortError');
  assert.equal(attempts, 1);
});
test('503 file creation/finalization failures are not replayed or converted into new uploads', async () => {
  for (const failedStage of ['upload_start', 'upload']) {
    let requests = 0;
    let created = false;
    const client = new provider.AsGemini('key', 'model', new AbortController().signal, async url => {
      requests++;
      if (url.endsWith('/upload/v1beta/files') && failedStage !== 'upload_start') {
        return new Response('', { headers: { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/resume' } });
      }
      return Response.json({ error: {} }, { status: 503 });
    }, async () => { assert.fail('uploads must not be replayed'); });
    await assert.rejects(client.upload(new Blob(['image']), 'image/jpeg', async () => { created = true; }), error => {
      assert.equal(error.stage, failedStage);
      assert.equal(error.httpStatus, 503);
      return true;
    });
    assert.equal(requests, failedStage === 'upload_start' ? 1 : 2);
    assert.equal(created, false);
  }
});
test('503 during file status polling retries the same tracked file without reuploading it', async () => {
  let uploads = 0;
  let reads = 0;
  let tracked = 0;
  let pauses = 0;
  const file = { name: 'files/abc', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc' };
  const client = new provider.AsGemini('key', 'model', new AbortController().signal, async url => {
    if (url.endsWith('/upload/v1beta/files')) return new Response('', { headers: { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/resume' } });
    if (url.endsWith('/upload/resume')) {
      uploads++;
      return Response.json({ file: { ...file, state: 'PROCESSING' } });
    }
    assert.equal(url, file.uri);
    return ++reads === 1 ? Response.json({ error: {} }, { status: 503 }) : Response.json({ ...file, state: 'ACTIVE' });
  }, async () => { pauses++; });
  const result = await client.upload(new Blob(['image']), 'image/jpeg', async () => { tracked++; });
  assert.equal(result.name, file.name);
  assert.equal(result.state, 'ACTIVE');
  assert.equal(uploads, 1);
  assert.equal(tracked, 1);
  assert.equal(reads, 2);
  assert.equal(pauses, 1);
});
test('file upload and processing errors identify their stage and preserve cleanup tracking', async () => {
  for (const failedStage of ['upload_start', 'upload', 'file_status']) {
    let created = false;
    const client = new provider.AsGemini('key', 'model', new AbortController().signal, async url => {
      if (url.endsWith('/upload/v1beta/files')) return failedStage === 'upload_start'
        ? Response.json({ error: {} }, { status: 403 })
        : new Response('', { headers: { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/resume' } });
      if (url.endsWith('/upload/resume')) return failedStage === 'upload'
        ? Response.json({ error: {} }, { status: 403 })
        : Response.json({ file: { name: 'files/abc', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc', state: 'PROCESSING' } });
      return Response.json({ error: {} }, { status: 404 });
    });
    await assert.rejects(client.upload(new Blob(['image']), 'image/jpeg', async () => { created = true; }), error => {
      assert.equal(error.stage, failedStage);
      assert.equal(error.code, failedStage === 'file_status' ? 'GEMINI_FILE_STATUS_404_FILE' : `GEMINI_${failedStage.toUpperCase()}_403_PERMISSION`);
      return true;
    });
    assert.equal(created, failedStage === 'file_status');
  }
});
test('server checks provider-reported duration instead of trusting the client', async () => {
  let created = false;
  const fakeFetch = async (url) => url.endsWith('/upload/v1beta/files')
    ? new Response('', { headers: { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/resume' } })
    : Response.json({ file: { name: 'files/abc', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc', state: 'ACTIVE', videoMetadata: { videoDuration: '31s' } } });
  const client = new provider.AsGemini('test-key', 'test-model', new AbortController().signal, fakeFetch);
  await assert.rejects(client.upload(new Blob(['video']), 'video/mp4', async () => { created = true; }), /30초/);
  assert.equal(created, true, 'failed video must still be tracked for deletion');
});
