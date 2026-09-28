const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const now = new Date(2026, 8, 28, 12);
const proposal = value => `📅 약속 제안\n${value}`;
const room = (id, date = '2026-09-28 14:30', extra = {}) => ({
  id, title: '수전 교체', listing_id: null, store_user_id: 'store',
  workflow_status: 'active', completed_at: null,
  estimate_requests: { id: 10, title: '문의 제목', user_id: 'me', status: 'open' },
  store_projects: null,
  chat_room_members: [{ user_id: 'me' }],
  chat_messages: [{ id: 'message', message: proposal(date), created_at: '2026-09-27T04:00:00Z' }],
  ...extra,
});

function harness({ rooms = [], stores = [{ id: 'store', display_name: '수리 가게', phone: '02-1234-5678' }], failTable = null } = {}) {
  const calls = [];
  const supabase = { from(table) {
    calls.push(['from', table]);
    let offset = 0;
    let end = Infinity;
    let ids;
    const query = {
      then(resolve, reject) {
        const rows = table === 'chat_rooms' ? rooms.slice(offset, end + 1) : stores.filter(store => ids.includes(store.id));
        return Promise.resolve({ data: rows, error: failTable === table ? new Error(`${table} unavailable`) : null }).then(resolve, reject);
      },
    };
    for (const method of ['select', 'order', 'limit', 'in', 'eq', 'is', 'like', 'range']) {
      query[method] = (...args) => {
        calls.push([method, ...args]);
        if (method === 'range') [offset, end] = args;
        if (method === 'in') ids = args[1];
        return query;
      };
    }
    return query;
  } };
  const filename = path.resolve(__dirname, '../lib/asHomeVisits.ts');
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const loaded = new Module(filename, module);
  loaded.require = name => { assert.equal(name, './supabase'); return { supabase }; };
  loaded._compile(output.outputText, filename);
  return { ...loaded.exports, calls };
}

test('appointment parser accepts the chat format, not preferred dates or impossible dates', () => {
  const { parseVisitAppointment } = harness();
  assert.equal(parseVisitAppointment(proposal('2026-09-28 14:30')), new Date(2026, 8, 28, 14, 30).getTime());
  for (const value of ['2026-09-28', proposal('2026-02-30 14:30'), proposal('2026-13-28 14:30'), proposal('2026-09-28 24:30'), proposal('2026-09-28 14:61'), '일반 대화', '📍 약속 장소\n서울']) {
    assert.equal(parseVisitAppointment(value), null, value);
  }
});

test('guests and accounts without appointments make no profile queries', async () => {
  const guest = harness();
  assert.deepEqual(await guest.fetchAsHomeVisits('', now), []);
  assert.deepEqual(guest.calls, []);
  const api = harness({ rooms: [room('no-message', '', { chat_messages: [] })] });
  assert.deepEqual(await api.fetchAsHomeVisits('me', now), []);
  assert.equal(api.calls.filter(call => call[0] === 'from').length, 1);
});

test('only own requests with active membership are eligible, never ordinary marketplace appointments', async () => {
  const api = harness({ rooms: [
    room('other-request', undefined, { estimate_requests: { id: 11, title: '다른 고객', user_id: 'other', status: 'open' } }),
    room('removed', undefined, { chat_room_members: [] }),
    room('trade', undefined, { listing_id: 123 }),
    room('no-request', undefined, { estimate_requests: null }),
    room('no-store', undefined, { store_user_id: null }),
    room('valid'),
  ] });
  assert.deepEqual((await api.fetchAsHomeVisits('me', now)).map(visit => visit.roomId), ['valid']);
  assert.ok(api.calls.some(call => call[0] === 'eq' && call[1] === 'estimate_requests.user_id' && call[2] === 'me'));
  assert.ok(api.calls.some(call => call[0] === 'eq' && call[1] === 'chat_room_members.user_id' && call[2] === 'me'));
  assert.ok(api.calls.some(call => call[0] === 'is' && call[1] === 'listing_id' && call[2] === null));
});

test('today and future appointments sort soonest first; completed and canceled work stays hidden', async () => {
  const api = harness({ rooms: [
    room('future', '2026-10-01 09:00'), room('today-afternoon'), room('today-morning', '2026-09-28 09:00'),
    room('past', '2026-09-27 22:00'),
    room('completed', undefined, { workflow_status: 'completed' }),
    room('timestamp', undefined, { completed_at: '2026-09-27T04:00:00Z' }),
    room('canceled', undefined, { store_projects: { name: '현장', status: 'canceled' } }),
    room('closed', undefined, { estimate_requests: { id: 11, user_id: 'me', title: '종료', status: 'closed' } }),
  ] });
  const result = await api.fetchAsHomeVisits('me', now);
  assert.deepEqual(result.map(visit => visit.roomId), ['today-morning', 'today-afternoon', 'future']);
  assert.equal(result[0].storeName, '수리 가게');
  assert.equal(result[0].storePhone, '0212345678');
  assert.equal(result[0].title, '수전 교체');
  assert.ok(!('storeId' in result[0]));
});

test('uses the latest proposal per room before checking dates, never resurfaces the replaced date', async () => {
  const api = harness({ rooms: [room('changed', '2026-09-27 14:30')] });
  assert.deepEqual(await api.fetchAsHomeVisits('me', now), []);
  assert.ok(api.calls.some(call => call[0] === 'like' && call[1] === 'chat_messages.message' && call[2] === `${proposal('')}%`));
  assert.ok(api.calls.some(call => call[0] === 'order' && call[1] === 'created_at' && call[2].ascending === false && call[2].foreignTable === 'chat_messages'));
  assert.ok(api.calls.some(call => call[0] === 'limit' && call[1] === 1 && call[2].foreignTable === 'chat_messages'));
});

test('paginates rooms instead of losing a future appointment after the first hundred rooms', async () => {
  const rooms = Array.from({ length: 100 }, (_, i) => room(`old-${i}`, '2026-09-27 10:00'));
  rooms.push(room('last-room'));
  const api = harness({ rooms });
  assert.deepEqual((await api.fetchAsHomeVisits('me', now)).map(visit => visit.roomId), ['last-room']);
  assert.deepEqual(api.calls.filter(call => call[0] === 'range'), [['range', 0, 99], ['range', 100, 199]]);
});

test('supports relation shapes, title fallbacks and missing or invalid phone numbers', async () => {
  const api = harness({ rooms: [room('project', undefined, {
    title: null,
    estimate_requests: [{ id: 10, title: '문의 제목', user_id: 'me', status: 'open' }],
    store_projects: [{ name: '현장 이름', status: 'in_progress' }],
  })], stores: [{ id: 'store', display_name: '가게 이름', phone: 'tel:01012345678?bad' }] });
  const [visit] = await api.fetchAsHomeVisits('me', now);
  assert.equal(visit.title, '현장 이름');
  assert.equal(visit.storePhone, null);
  const [missing] = await harness({ rooms: [room('missing')], stores: [] }).fetchAsHomeVisits('me', now);
  assert.equal(missing.storeName, '담당 가게');
  assert.equal(missing.storePhone, null);
});

test('database failures remain retryable failures, not empty appointment states', async () => {
  for (const failTable of ['chat_rooms', 'profiles']) {
    await assert.rejects(harness({ rooms: [room('valid')], failTable }).fetchAsHomeVisits('me', now), /unavailable/);
  }
});
