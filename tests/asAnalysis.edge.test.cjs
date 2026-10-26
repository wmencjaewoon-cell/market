const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const owner = '00000000-0000-4000-8000-000000000001';
const analysisId = '10000000-0000-4000-8000-000000000001';
const input = {
  description: '손잡이가 헐거워요', categories: ['가구/수납'], symptoms: [], safety_answer: 'none', hazards: [],
  consent_version: '2026-09-28', media: [{ mime_type: 'image/jpeg', bytes: 100, duration_seconds: null }],
};

async function withHandler(overrides, callback) {
  const previous = global.Deno;
  let handler;
  const calls = [];
  const environment = { SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', GEMINI_API_KEY: 'test', AS_AI_MODEL: 'test-model', AS_AI_ENABLED: 'true', ...overrides.env };
  const row = { id: analysisId, user_id: owner, status: 'uploading', attempts: 0, result: null, error_message: null, created_at: new Date().toISOString(), input_payload: input, provider_file_names: ['files/private'], ...overrides.record };
  const db = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      const error = overrides.rpcErrors?.[name] || overrides.rpcError;
      if (error) return { data: null, error: { message: error } };
      return { data: name === 'complete_as_ai_analysis' ? { ...row, status: 'completed', result: args.p_result } : row, error: null };
    },
    from: table => {
      const filters = [];
      const builder = {
        select: () => builder,
        eq: (field, value) => { filters.push([field, value]); return builder; },
        neq: (field, value) => { filters.push([field, 'neq', value]); return builder; },
        not: () => builder,
        order: () => builder,
        update: values => { calls.push({ table, values, filters }); return builder; },
        then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
        maybeSingle: async () => {
          calls.push({ table, filters });
          if (table === 'profiles') return { data: { status: overrides.status || 'active', role: overrides.role === undefined ? 'admin' : overrides.role }, error: null };
          return { data: overrides.missing ? null : row, error: null };
        },
      };
      return builder;
    },
  };
  const createClient = (_url, key) => key === 'anon'
    ? { auth: { getUser: async () => ({ data: { user: overrides.unauthorized ? null : { id: owner } }, error: null }) } }
    : db;
  const load = filename => {
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const loaded = new Module(filename, module);
    loaded.paths = module.paths;
    const original = loaded.require.bind(loaded);
    loaded.require = name => {
      if (name.startsWith('https://esm.sh/')) return { createClient };
      if (!name.endsWith('.ts')) return original(name);
      const exports = load(path.resolve(path.dirname(filename), name));
      if (name.endsWith('asGemini.ts') && overrides.provider) {
        return { ...exports, deleteProviderFiles: async () => [], AsGemini: class {
          async analyze(...args) {
            calls.push({ provider: 'analyze' });
            if (typeof overrides.provider === 'number') throw new exports.GeminiRequestError('analyze', overrides.provider, overrides.provider === 429 ? 'quota' : 'unavailable');
            return overrides.provider(...args);
          }
        } };
      }
      return exports;
    };
    loaded._compile(compiled.outputText, filename);
    return loaded.exports;
  };
  global.Deno = { env: { get: name => environment[name] }, serve: fn => { handler = fn; } };
  try {
    load(path.resolve(__dirname, '../supabase/functions/analyze-as-issue/index.ts'));
    const invoke = (body, authenticated = true) => handler(new Request('https://test.invalid/function', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer test' } : {}) }, body: JSON.stringify(body),
    }));
    await callback(invoke, calls);
  } finally { global.Deno = previous; }
}

test('AI endpoint rejects absent/invalid authentication and blocked/deleting accounts', async () => {
  await withHandler({}, async (invoke, calls) => { assert.equal((await invoke({ action: 'prepare', id: analysisId, input }, false)).status, 401); assert.equal(calls.length, 0); });
  await withHandler({ unauthorized: true }, async invoke => assert.equal((await invoke({ action: 'prepare', id: analysisId, input })).status, 401));
  for (const status of ['blocked', 'deletion_pending']) await withHandler({ status }, async invoke => assert.equal((await invoke({ action: 'prepare', id: analysisId, input })).status, 403));
});
test('disabled or unconfigured AI fails explicitly without reserving quota or fabricating a report', async () => {
  for (const env of [{ AS_AI_ENABLED: 'false' }, { GEMINI_API_KEY: '' }, { AS_AI_MODEL: '' }]) {
    await withHandler({ env }, async (invoke, calls) => {
      const response = await invoke({ action: 'prepare', id: analysisId, input });
      assert.equal(response.status, 503);
      const data = await response.json();
      assert.equal(data.code, 'AS_AI_UNAVAILABLE'); assert.equal(data.analysis, undefined);
      assert.equal(calls.filter(call => call.name).length, 0);
    });
  }
});
test('admin pilot rejects ordinary users on prepare AND execute without spending quota', async () => {
  for (const role of ['user', 'store', null]) {
    for (const access of [undefined, 'admin', 'PUBLIC', 'invalid']) {
      await withHandler({ role, env: { AS_AI_ACCESS_MODE: access } }, async (invoke, calls) => {
        for (const action of ['prepare', 'analyze']) {
          const response = await invoke({ action, id: analysisId, input, role: 'admin', user_metadata: { role: 'admin' } });
          assert.equal(response.status, 403);
          assert.equal((await response.json()).code, 'AS_AI_ADMIN_ONLY');
        }
        assert.equal(calls.filter(call => call.name).length, 0);
      });
    }
  }
});
test('public rollout requires an explicit server flag and does not bypass the kill switch', async () => {
  await withHandler({ role: 'user', env: { AS_AI_ACCESS_MODE: 'public' } }, async (invoke, calls) => {
    assert.equal((await invoke({ action: 'prepare', id: analysisId, input })).status, 200);
    assert.equal(calls.filter(call => call.name === 'reserve_as_ai_analysis').length, 1);
  });
  await withHandler({ role: 'admin', env: { AS_AI_ENABLED: 'false', AS_AI_ACCESS_MODE: 'admin' } }, async (invoke, calls) => {
    assert.equal((await invoke({ action: 'prepare', id: analysisId, input })).status, 503);
    assert.equal(calls.filter(call => call.name).length, 0);
  });
});
test('pilot restriction does not hide an ordinary user own existing analysis history', async () => {
  await withHandler({ role: 'user' }, async (invoke, calls) => {
    assert.equal((await invoke({ action: 'status', id: analysisId })).status, 200);
    const filters = calls.find(call => call.table === 'as_ai_analyses').filters;
    assert.ok(filters.some(([field, value]) => field === 'user_id' && value === owner));
    assert.equal(calls.filter(call => call.name).length, 0);
  });
});
test('prepare derives owner and paths from authenticated identity, not caller-supplied user/URL', async () => {
  await withHandler({}, async (invoke, calls) => {
    const response = await invoke({ action: 'prepare', id: analysisId, input, user_id: 'attacker', media_url: 'https://attacker.invalid/private' });
    assert.equal(response.status, 200);
    const reserved = calls.find(call => call.name === 'reserve_as_ai_analysis').args;
    assert.equal(reserved.p_user_id, owner);
    assert.equal(reserved.p_media[0].path, `${owner}/${analysisId}/0.jpg`);
    const data = await response.json();
    assert.equal(data.analysis.input_payload, undefined);
    assert.equal(data.analysis.provider_file_names, undefined);
  });
});
test('text-only preparation reserves quota with an empty attachment manifest', async () => {
  await withHandler({}, async (invoke, calls) => {
    const response = await invoke({ action: 'prepare', id: analysisId, input: { ...input, media: [] } });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).media, []);
    const reserved = calls.find(call => call.name === 'reserve_as_ai_analysis').args;
    assert.equal(reserved.p_user_id, owner);
    assert.deepEqual(reserved.p_media, []);
    assert.equal(reserved.p_input.description, input.description);
  });
});
test('status is owner-scoped and does not leak provider file references', async () => {
  await withHandler({}, async (invoke, calls) => {
    const response = await invoke({ action: 'status', id: analysisId, user_id: 'other-user' });
    assert.equal(response.status, 200);
    const filters = calls.find(call => call.table === 'as_ai_analyses').filters;
    assert.ok(filters.some(([field, value]) => field === 'user_id' && value === owner));
    assert.equal((await response.json()).analysis.provider_file_names, undefined);
  });
  await withHandler({ missing: true }, async invoke => assert.equal((await invoke({ action: 'status', id: analysisId })).status, 404));
});
test('quota errors and malformed input remain explicit failures', async () => {
  await withHandler({ rpcError: 'ANALYSIS_DAILY_LIMIT' }, async invoke => {
    const response = await invoke({ action: 'prepare', id: analysisId, input });
    assert.equal(response.status, 429); assert.match((await response.json()).error, /5회/);
  });
  await withHandler({}, async (invoke, calls) => {
    assert.equal((await invoke({ action: 'prepare', id: analysisId, input: { ...input, consent_version: '' } })).status, 400);
    assert.equal((await invoke({ action: 'prepare', id: 'not-a-uuid', input })).status, 400);
    assert.equal(calls.filter(call => call.name).length, 0);
  });
});

test('database failure codes distinguish exhausted analyses from daily quota and busy work', async () => {
  for (const code of ['ANALYSIS_RETRY_LIMIT', 'ANALYSIS_EXPIRED', 'ANALYSIS_DAILY_LIMIT', 'ANALYSIS_RATE_LIMIT', 'ANALYSIS_BUSY', 'ANALYSIS_LEASE_EXPIRED']) {
    for (const action of ['prepare', 'analyze']) {
      await withHandler({ rpcError: `${code}: private-database-detail` }, async (invoke, calls) => {
        const response = await invoke({ action, id: analysisId, input });
        assert.ok([409, 429].includes(response.status));
        const data = await response.json();
        assert.equal(data.code, code);
        assert.doesNotMatch(data.error, /private-database-detail/);
        assert.equal(calls.filter(call => call.name).length, 1, 'failure must not reserve a replacement analysis automatically');
      });
    }
  }
  await withHandler({ rpcError: 'unexpected private-database-detail' }, async invoke => {
    const data = await (await invoke({ action: 'analyze', id: analysisId })).json();
    assert.equal(data.code, 'AS_AI_DATABASE_ERROR');
    assert.doesNotMatch(data.error, /private-database-detail/);
  });
});

const preliminaryAnswer = {
  issue_area: '수납장 손잡이', problem_summary: '고정부가 헐거워졌을 수 있습니다.',
  observations: [], possible_causes: ['고정부의 느슨함'], hazards: [], safety_uncertain: true,
  risk_level: 'unknown', recommended_action: 'needs_more_info', repairability: 'unknown',
  reason: '사진이 없어 상태 확인이 필요합니다.', follow_up_questions: [], limitations: ['외관을 확인하지 못했습니다.'], guide_key: null,
};
test('only validated successful answers invoke atomic completion', async () => {
  await withHandler({ record: { input_payload: { ...input, media: [] } }, provider: () => preliminaryAnswer }, async (invoke, calls) => {
    const response = await invoke({ action: 'analyze', id: analysisId, user_id: 'attacker' });
    assert.equal(response.status, 200);
    const completed = calls.filter(call => call.name === 'complete_as_ai_analysis');
    assert.equal(completed.length, 1);
    assert.equal(completed[0].args.p_id, analysisId);
    assert.equal(completed[0].args.p_user_id, owner);
    assert.equal(completed[0].args.p_result.schema_version, 1);
    assert.equal(completed[0].args.p_model, 'test-model');
    assert.ok(completed[0].args.p_lease);
    assert.equal((await response.json()).analysis.status, 'completed');
    assert.equal(calls.some(call => call.values?.status === 'completed'), false, 'completion must not bypass the DB lock');
  });
});
test('faucet symptoms reach the provider and safety questions are saved as uncertainty, not a hazard finding', async () => {
  const leak = { ...input, media: [], categories: ['누수/배관'], symptoms: ['물이 새요'], description: '화장실 세면대 수도꼭지에서 물이 샌다' };
  const answer = { ...preliminaryAnswer, issue_area: '세면대 수도꼭지', problem_summary: '수도꼭지 누수에 대한 설명입니다.', possible_causes: ['수전 부품 마모 가능성'], follow_up_questions: ['주변 콘센트에 물이 닿았나요?'] };
  await withHandler({ record: { input_payload: leak }, provider: () => answer }, async (invoke, calls) => {
    const response = await invoke({ action: 'analyze', id: analysisId });
    assert.equal(response.status, 200);
    const result = (await response.json()).analysis.result;
    assert.equal(calls.filter(call => call.provider === 'analyze').length, 1);
    assert.equal(result.recommended_action, 'needs_more_info');
    assert.equal(result.risk_level, 'unknown');
    assert.deepEqual(result.hazards, []);
    assert.deepEqual(result.follow_up_questions, answer.follow_up_questions);
    assert.equal(result.guide, null);
    assert.deepEqual(calls.find(call => call.name === 'complete_as_ai_analysis').args.p_result, result);
  });
  await withHandler({ record: { input_payload: { ...leak, description: '누수로 콘센트에서 불꽃이 나요' } }, provider: () => { throw new Error('must not call'); } }, async (invoke, calls) => {
    const response = await invoke({ action: 'analyze', id: analysisId });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).analysis.result.recommended_action, 'emergency');
    assert.equal(calls.filter(call => call.provider === 'analyze').length, 0);
  });
});
test('503, 429 and invalid answers never invoke quota completion', async () => {
  for (const provider of [503, 429, () => ({ invalid: true })]) {
    await withHandler({ record: { input_payload: { ...input, media: [] } }, provider }, async (invoke, calls) => {
      const response = await invoke({ action: 'analyze', id: analysisId });
      assert.equal(response.status, 502);
      assert.equal(calls.filter(call => call.name === 'complete_as_ai_analysis').length, 0);
      const failure = calls.find(call => call.values?.status === 'failed');
      assert.ok(failure.filters.some(filter => filter[0] === 'lease_id'));
      assert.ok(failure.filters.some(filter => filter[0] === 'status' && filter[1] === 'neq' && filter[2] === 'completed'));
    });
  }
});
test('saved results are reused without another AI call or completion', async () => {
  await withHandler({ record: { status: 'completed', result: preliminaryAnswer }, provider: () => { throw new Error('must not call'); } }, async (invoke, calls) => {
    assert.equal((await invoke({ action: 'analyze', id: analysisId })).status, 200);
    assert.equal(calls.filter(call => call.provider || call.name === 'complete_as_ai_analysis').length, 0);
  });
});
test('completion failures return sanitized codes without fabricating a completed answer', async () => {
  for (const [error, status] of [['ANALYSIS_DAILY_LIMIT', 429], ['ANALYSIS_LEASE_EXPIRED', 409], ['private database detail', 409]]) {
    await withHandler({ record: { input_payload: { ...input, media: [] } }, provider: () => preliminaryAnswer, rpcErrors: { complete_as_ai_analysis: error } }, async (invoke, calls) => {
      const response = await invoke({ action: 'analyze', id: analysisId });
      assert.equal(response.status, status);
      const data = await response.json();
      assert.equal(data.analysis, undefined);
      assert.doesNotMatch(data.error, /private database detail/);
      assert.ok(calls.some(call => call.values?.status === 'failed'));
    });
  }
});

test('prepare blocks exhausted or expired attachment drafts before returning upload paths', async () => {
  for (const [record, code] of [
    [{ status: 'failed', attempts: 2 }, 'ANALYSIS_RETRY_LIMIT'],
    [{ created_at: new Date(Date.now() - 90000000).toISOString() }, 'ANALYSIS_EXPIRED'],
  ]) {
    await withHandler({ record }, async invoke => {
      const response = await invoke({ action: 'prepare', id: analysisId, input });
      assert.equal(response.status, 409);
      const data = await response.json();
      assert.equal(data.code, code);
      assert.equal(data.media, undefined);
    });
  }
  for (const status of ['completed', 'processing']) {
    await withHandler({ record: { status, attempts: 2 } }, async invoke => {
      const response = await invoke({ action: 'prepare', id: analysisId, input });
      assert.equal(response.status, 200, 'completed/busy work must not tell the client to reserve another analysis');
      assert.equal((await response.json()).analysis.status, status);
    });
  }
});
