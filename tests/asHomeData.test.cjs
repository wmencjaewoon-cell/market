const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function harness({ reviews = [], stores = [], reviewError = null, storeError = null } = {}) {
  const calls = [];
  const supabase = { from(table) {
    calls.push(['from', table]);
    const result = table === 'reviews' ? { data: reviews, error: reviewError } : { data: stores, error: storeError };
    const query = { then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
    for (const method of ['select', 'order', 'limit', 'in', 'eq']) {
      query[method] = (...args) => { calls.push([method, ...args]); return query; };
    }
    return query;
  } };
  const filename = path.resolve(path.dirname(module.filename), '../lib/asHomeData.ts');
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const loaded = new Module(filename, module);
  loaded.require = name => {
    assert.equal(name, './supabase');
    return { supabase };
  };
  loaded._compile(output.outputText, filename);
  return { ...loaded.exports, calls };
}

test('no reviews is an empty state, not fabricated feedback', async () => {
  const api = harness();
  assert.deepEqual(await api.fetchAsHomeReviews(), []);
  assert.deepEqual(api.calls.filter(call => call[0] === 'from'), [['from', 'reviews']]);
});

test('only verified-store targets are shown, capped at two reviews and two sorted images', async () => {
  const reviews = [
    { id: 1, target_user_id: 'person', sentiment: 'negative', comment: 'private trade review', review_images: [] },
    ...[2, 3, 4].map(id => ({ id, target_user_id: 'store', sentiment: 'negative', comment: '실제 후기', review_images: [{ image_path: 'b.jpg', sort_order: 2 }, { image_path: 'a.jpg', sort_order: 1 }, { image_path: 'c.jpg', sort_order: 3 }] })),
  ];
  const api = harness({ reviews, stores: [{ id: 'store', display_name: '실제 가게' }] });
  const result = await api.fetchAsHomeReviews();
  assert.deepEqual(result.map(review => review.id), [2, 3]);
  assert.equal(result[0].comment, '실제 후기');
  assert.equal(result[0].sentiment, 'negative');
  assert.equal(result[0].storeName, '실제 가게');
  assert.deepEqual(result[0].images.map(image => image.image_path), ['a.jpg', 'b.jpg']);
  assert.equal(reviews[1].review_images[0].image_path, 'b.jpg');
  assert.ok(api.calls.some(call => call[0] === 'eq' && call[1] === 'user_type' && call[2] === 'store'));
  assert.ok(api.calls.some(call => call[0] === 'eq' && call[1] === 'business_verified' && call[2] === true));
  assert.ok(api.calls.some(call => call[0] === 'limit' && call[1] === 20));
});

test('review and profile lookup failures remain errors instead of looking like an empty feed', async () => {
  await assert.rejects(harness({ reviewError: new Error('reviews unavailable') }).fetchAsHomeReviews(), /reviews unavailable/);
  await assert.rejects(harness({ reviews: [{ target_user_id: 'store' }], storeError: new Error('profile unavailable') }).fetchAsHomeReviews(), /profile unavailable/);
});
