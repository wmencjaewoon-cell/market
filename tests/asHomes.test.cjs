const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function loadContract() {
  const filename = path.resolve(__dirname, '../supabase/functions/_shared/asAnalysis.ts');
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = new Module(filename, module);
  loaded.paths = module.paths;
  loaded._compile(compiled.outputText, filename);
  return loaded.exports;
}

const baseInput = {
  description: '수전에서 물이 새요', categories: ['누수/배관'], symptoms: [],
  safety_answer: 'none', hazards: [], consent_version: '2026-09-28', media: [],
};

test('analysis input accepts only a valid optional home id', () => {
  const contract = loadContract();
  const homeId = '20000000-0000-4000-8000-000000000001';
  assert.equal(contract.parseAnalysisInput({ ...baseInput, home_id: homeId }).home_id, homeId);
  assert.equal('home_id' in contract.parseAnalysisInput(baseInput), false);
  assert.throws(() => contract.parseAnalysisInput({ ...baseInput, home_id: 'another-user-home' }), /집 정보/);
});

test('home migration enforces owner RLS and one default home', () => {
  const sql = readFileSync(path.resolve(__dirname, '../supabase/migrations/20261020000000_user_homes.sql'), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /user_id = auth\.uid\(\)/i);
  assert.match(sql, /unique index[\s\S]*where is_default/i);
  assert.match(sql, /ensure_user_home_after_delete/i);
});

test('database guards match the current six-attachment and schema-v2 analysis contract', () => {
  const sql = readFileSync(path.resolve(__dirname, '../supabase/migrations/20261020010000_as_ai_contract_v2.sql'), 'utf8');
  assert.match(sql, /sort_order between 0 and 5/i);
  assert.match(sql, /jsonb_array_length\(p_media\) > 6/i);
  assert.match(sql, /schema_version'[\s\S]*\('1', '2'\)/i);
  assert.match(sql, /duration_seconds[\s\S]*<= 60/i);
});

test('AI backend payload uses minimal home context while nearby lookup checks both owners', () => {
  const analysis = readFileSync(path.resolve(__dirname, '../supabase/functions/analyze-as-issue/index.ts'), 'utf8');
  const backendStart = analysis.indexOf('JSON.stringify(', analysis.indexOf('/analyze-supabase'));
  const backendBody = analysis.slice(backendStart, analysis.indexOf('signal:', backendStart));
  assert.match(backendBody, /home_context/);
  for (const privateField of ['road_address', 'jibun_address', 'detail_address', 'latitude', 'longitude']) {
    assert.doesNotMatch(backendBody, new RegExp(privateField));
  }
  const nearby = readFileSync(path.resolve(__dirname, '../supabase/functions/nearby-as-places/index.ts'), 'utf8');
  assert.match(nearby, /as_ai_analyses[\s\S]*eq\('user_id', user\.id\)/);
  assert.match(nearby, /user_homes[\s\S]*eq\('user_id', user\.id\)/);
  assert.match(nearby, /analysis\.input_payload\?\.home_id !== homeId/);
});
