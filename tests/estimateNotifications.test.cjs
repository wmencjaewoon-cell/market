const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function loadTypeScript(relativePath, mocks = {}, globals = {}) {
  const filename = path.resolve(path.dirname(module.filename), '..', relativePath);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = new Module(filename, module);
  loaded.testGlobals = globals;
  loaded.require = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected runtime import: ${name}`);
  };
  loaded._compile(`const { Deno, fetch } = module.testGlobals;\n${compiled.outputText}`, filename);
  return loaded.exports;
}

const routes = loadTypeScript('lib/estimateNotificationRoute.ts');

test('new and previously stored unassigned notifications open admin assignment', () => {
  const expected = '/admin?tab=estimates&requestId=123';
  assert.equal(routes.getEstimateNotificationRoute({ estimateRequestId: 123, targetScreen: 'admin_estimates' }), expected);
  assert.equal(routes.getEstimateNotificationRoute({ estimateRequestId: '123', storeUserId: null }), expected);
  // An admin notification stays in the admin console even if the request has since been assigned.
  assert.equal(routes.getEstimateNotificationRoute({ estimateRequestId: 123, targetScreen: 'admin_estimates', storeUserId: 'store' }), expected);
});

test('store notifications and unspecified legacy payloads retain the store route', () => {
  assert.equal(routes.getEstimateNotificationRoute({ estimateRequestId: 12, storeUserId: 'store' }), '/store/estimates?requestId=12');
  assert.equal(routes.getEstimateNotificationRoute({ estimateRequestId: 12, targetScreen: 'store_estimates' }), '/store/estimates?requestId=12');
  assert.equal(routes.getEstimateNotificationRoute({ estimateRequestId: 12 }), '/store/estimates?requestId=12');
});

test('missing or invalid ids open a list and cannot inject query parameters', () => {
  for (const id of [null, undefined, '', 0, -1, 1.5, true, [], Infinity, '12&tab=users']) {
    assert.equal(routes.normalizeEstimateRequestId(id), null);
    assert.equal(routes.getEstimateNotificationRoute({ estimateRequestId: id, storeUserId: null }), '/admin?tab=estimates');
  }
  assert.equal(routes.normalizeEstimateRequestId(' 123 '), 123);
});

test('cold-start and running-app push taps use the same admin route without double navigation', async () => {
  const pushed = [];
  let listener;
  let cleared = 0;
  const response = {
    actionIdentifier: 'default',
    notification: { request: { identifier: 'request-123', content: {
      title: 'Estimate', body: 'New request',
      data: { type: 'estimate_request', estimateRequestId: 123, storeUserId: null },
    } } },
  };
  const notifications = loadTypeScript('lib/notifications.ts', {
    'expo-constants': {},
    '@react-native-async-storage/async-storage': {},
    'expo-device': {},
    'expo-notifications': {
      setNotificationHandler: () => {},
      getLastNotificationResponse: () => response,
      clearLastNotificationResponse: () => { cleared += 1; },
      addNotificationResponseReceivedListener: (callback) => { listener = callback; return { remove: () => {} }; },
    },
    'expo-router': { router: { push: (route) => pushed.push(route) } },
    'react-native': { Platform: { OS: 'ios' } },
    './supabase': {},
    './estimateNotificationRoute': routes,
  });
  notifications.listenNotificationResponse();
  assert.equal(await notifications.handleInitialNotificationResponse(), true);
  listener(response);
  assert.deepEqual(pushed, ['/admin?tab=estimates&requestId=123']);
  assert.equal(cleared, 1);

  listener({ ...response, notification: { request: {
    identifier: 'request-124', content: { data: {
      type: 'estimate_request', estimateRequestId: 124, targetScreen: 'store_estimates', storeUserId: 'store',
    } },
  } } });
  assert.equal(pushed.at(-1), '/store/estimates?requestId=124');
});

function notificationServer({ request = {}, profileError = null, currentUserId = 'customer', admins = null } = {}) {
  let handler;
  const inserted = [];
  const pushed = [];
  const queried = [];
  const rows = {
    estimate_requests: [{ id: 123, user_id: 'customer', title: 'Repair', assigned_store_user_id: null, preferred_store_user_id: null, ...request }],
    profiles: admins ?? [
      { id: 'admin', role: 'admin', status: null },
      { id: 'admin-active', role: 'admin', status: 'active' },
      { id: 'admin-blocked', role: 'admin', status: 'blocked' },
      { id: 'store', role: 'user', status: 'active' },
      { id: 'customer', role: 'user', status: 'active' },
    ],
    store_staff_members: [
      { store_user_id: 'store', staff_user_id: 'manager', role: 'manager', status: 'active' },
      { store_user_id: 'store', staff_user_id: 'assigned', role: 'employee', status: 'active' },
      { store_user_id: 'store', staff_user_id: 'unassigned', role: 'employee', status: 'active' },
      { store_user_id: 'store', staff_user_id: 'inactive-manager', role: 'manager', status: 'inactive' },
      { store_user_id: 'other-store', staff_user_id: 'other-manager', role: 'manager', status: 'active' },
    ],
  };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: currentUserId } }, error: null }) },
    from(table) {
      queried.push(table);
      let selected = [...(rows[table] || [])];
      const result = () => ({ data: selected, error: table === 'profiles' ? profileError : null });
      const query = {
        select: () => query,
        eq: (key, value) => { selected = selected.filter((row) => row[key] === value); return query; },
        or: (value) => {
          assert.equal(value, 'status.is.null,status.neq.blocked');
          selected = selected.filter((row) => row.status !== 'blocked');
          return query;
        },
        maybeSingle: async () => ({ data: selected[0] || null, error: null }),
        insert: async (values) => { inserted.push(...values); return { error: null }; },
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  };
  loadTypeScript('supabase/functions/send-estimate-request-notification/index.ts', {
    'https://deno.land/std@0.224.0/http/server.ts': { serve: (callback) => { handler = callback; } },
    'https://esm.sh/@supabase/supabase-js@2.45.4': { createClient: () => db },
  }, {
    Deno: { env: { get: (name) => name === 'SUPABASE_URL' ? 'https://example.com' : 'test-key' } },
    fetch: async (url, options) => {
      if (url.includes('/rest/v1/push_tokens')) {
        const filter = new URL(url).searchParams.get('user_id');
        const ids = filter.slice('in.('.length, -1).split(',');
        assert.deepEqual(ids, inserted.map((item) => item.user_id));
        return Response.json(ids.map((id) => ({ user_id: id, token: `token-${id}` })));
      }
      assert.equal(url, 'https://exp.host/--/api/v2/push/send');
      pushed.push(...JSON.parse(options.body));
      return Response.json({ data: [] });
    },
  });
  return {
    inserted, pushed, queried,
    invoke: () => handler(new Request('https://example.com/notify', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 123 }),
    })),
  };
}

test('unassigned requests notify only non-blocked admins, with an admin route in push and inbox', async () => {
  const server = notificationServer({ request: { preferred_staff_user_id: 'unassigned' } });
  assert.equal((await server.invoke()).status, 200);
  assert.deepEqual(server.inserted.map((item) => item.user_id), ['admin', 'admin-active']);
  assert.equal(server.queried.includes('store_staff_members'), false);
  assert.equal(server.pushed.length, 2);
  for (const item of [...server.inserted, ...server.pushed]) {
    assert.equal(item.data.targetScreen, 'admin_estimates');
    assert.equal(routes.getEstimateNotificationRoute(item.data), '/admin?tab=estimates&requestId=123');
  }
});

test('selected-store requests notify that store, its managers and assigned staff, not admins', async () => {
  const server = notificationServer({ request: { preferred_store_user_id: 'store', assigned_staff_user_id: 'assigned' } });
  assert.equal((await server.invoke()).status, 200);
  assert.deepEqual(server.inserted.map((item) => item.user_id), ['store', 'manager', 'assigned']);
  assert.equal(server.queried.includes('profiles'), false);
  for (const item of [...server.inserted, ...server.pushed]) {
    assert.equal(routes.getEstimateNotificationRoute(item.data), '/store/estimates?requestId=123');
  }
});

test('admin lookup failure never falls back to sending to stores', async () => {
  const server = notificationServer({ profileError: { message: 'Database unavailable' } });
  assert.equal((await server.invoke()).status, 500);
  assert.equal(server.inserted.length, 0);
  assert.equal(server.pushed.length, 0);
});

test('no administrators means no notification to any other account', async () => {
  const server = notificationServer({ admins: [] });
  const result = await server.invoke();
  assert.equal((await result.json()).reason, 'no recipients');
  assert.equal(server.inserted.length, 0);
  assert.equal(server.pushed.length, 0);
});

test('a different user cannot trigger notifications for someone else\'s request', async () => {
  const server = notificationServer({ currentUserId: 'another-user' });
  assert.equal((await server.invoke()).status, 403);
  assert.equal(server.inserted.length, 0);
});
