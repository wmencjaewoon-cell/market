const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Run against disposable PostgreSQL, never the user's live Supabase project.
const modulePath = process.env.AS_SQL_TEST_MODULES;
test('AI migration, RLS, immutable media, quota, leases, guide review, inquiry linking and retention', { skip: !modulePath }, async t => {
  const { PGlite } = require(path.join(modulePath, '@electric-sql/pglite'));
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  const admin = '00000000-0000-4000-8000-000000000003';
  const id = '10000000-0000-4000-8000-000000000001';
  const lease = '20000000-0000-4000-8000-000000000001';
  const file = `${owner}/${id}/0.jpg`;
  const run = sql => db.exec(sql);
  const query = (sql, params = []) => db.query(sql, params);
  const asUser = async (uid, fn, role = 'authenticated') => {
    await run(`set role ${role}`);
    await query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [uid, role]);
    try { return await fn(); } finally { await run('reset role'); }
  };
  try {
    await run(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      grant usage on schema public, auth, storage to anon, authenticated, service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${owner}'), ('${other}'), ('${admin}');
      create table public.profiles(id uuid primary key, role text, status text);
      insert into public.profiles values ('${owner}','user','active'), ('${other}','user','active'), ('${admin}','admin','active');
      grant select on public.profiles to authenticated;
      create table public.estimate_requests(id bigint generated always as identity primary key, user_id uuid, title text);
      alter table public.estimate_requests enable row level security;
      create policy inquiry_read on public.estimate_requests for select to authenticated using(user_id = auth.uid() or auth.uid() = '${admin}');
      create policy inquiry_insert on public.estimate_requests for insert to authenticated with check(user_id = auth.uid());
      create policy inquiry_update on public.estimate_requests for update to authenticated using(user_id = auth.uid());
      grant select, insert, update, delete on public.estimate_requests to authenticated;
      grant usage on sequence public.estimate_requests_id_seq to authenticated;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id bigint generated always as identity primary key, bucket_id text, name text, created_at timestamptz default now(), unique(bucket_id,name));
      alter table storage.objects enable row level security;
      -- Deliberately broad legacy policy: new restrictive guards must still protect AI files.
      create policy legacy_storage on storage.objects for all to authenticated, anon using(true) with check(true);
      grant select, insert, update, delete on storage.objects to authenticated, anon;
      grant usage on sequence storage.objects_id_seq to authenticated, anon;
    `);
    const migration = readFileSync(path.join(__dirname, '../supabase/migrations/20260928000000_as_ai_analysis.sql'), 'utf8');
    await run(migration);
    await run(migration); // SQL Editor reruns must preserve existing data and signatures.
    const textQuestions = readFileSync(path.join(__dirname, '../supabase/migrations/20260929000000_as_ai_text_questions.sql'), 'utf8');
    await run(textQuestions);
    await run(textQuestions);
    await asUser(owner, async () => {
      await assert.rejects(query('insert into as_ai_analyses(id,user_id,input_payload) values($1,$2,$3)', [id, owner, '{}']), /permission denied/);
      await assert.rejects(query('select reserve_as_ai_analysis($1,$2,$3,$4)', [id, owner, '{}', '[]']), /permission denied/);
      await assert.rejects(query('select claim_as_ai_analysis($1,$2,$3)', [id, owner, lease]), /permission denied/);
    });
    const reserve = (analysisId, payload = {}) => asUser('', () => query('select reserve_as_ai_analysis($1,$2,$3,$4)', [analysisId, owner, JSON.stringify(payload), JSON.stringify([{ path: `${owner}/${analysisId}/0.jpg`, mime_type: 'image/jpeg', bytes: 100 }])]), 'service_role');
    await reserve(id);
    await reserve(id);
    assert.equal((await query('select count(*)::int as count from as_ai_analyses')).rows[0].count, 1);
    await assert.rejects(reserve(id, { changed: true }), /ANALYSIS_ID_CONFLICT/);
    await asUser(owner, async () => {
      assert.equal((await query('select * from as_ai_analyses')).rows.length, 1);
      await query('insert into storage.objects(bucket_id,name) values($1,$2)', ['as-analysis-media', file]);
      await assert.rejects(query('insert into storage.objects(bucket_id,name) values($1,$2)', ['as-analysis-media', file.replace('0.jpg', '1.jpg')]), /row-level security/);
      await query('update storage.objects set name = $1 where name = $2', ['changed', file]);
      await query('delete from storage.objects where name = $1', [file]);
      assert.equal((await query('select name from storage.objects')).rows[0].name, file);
    });
    await asUser(other, async () => {
      assert.equal((await query('select * from as_ai_analyses')).rows.length, 0);
      assert.equal((await query('select * from storage.objects')).rows.length, 0);
      await assert.rejects(query('insert into storage.objects(bucket_id,name) values($1,$2)', ['as-analysis-media', file]), /row-level security/);
    });
    await query("insert into storage.objects(bucket_id,name) values('estimate-images','legacy.jpg')");
    await asUser('', async () => {
      assert.deepEqual((await query('select name from storage.objects')).rows.map(item => item.name), ['legacy.jpg']);
      await assert.rejects(query("insert into storage.objects(bucket_id,name) values('as-analysis-media','bad')"), /row-level security/);
    }, 'anon');
    await asUser('', () => query('select claim_as_ai_analysis($1,$2,$3)', [id, owner, lease]), 'service_role');
    await assert.rejects(asUser('', () => query('select claim_as_ai_analysis($1,$2,$3)', [id, owner, lease]), 'service_role'), /ANALYSIS_BUSY/);
    await asUser(owner, async () => {
      await assert.rejects(query('insert into estimate_requests(user_id,title,ai_analysis_id) values($1,$2,$3)', [owner, 'pending', id]), /완료된/);
    });
    await query("update as_ai_analyses set status='completed', result=$2 where id=$1", [id, JSON.stringify({ schema_version: 1 })]);
    await asUser(other, async () => {
      await assert.rejects(query('insert into estimate_requests(user_id,title,ai_analysis_id) values($1,$2,$3)', [other, 'forged', id]), /본인의/);
    });
    let requestId;
    await asUser(owner, async () => {
      requestId = (await query('insert into estimate_requests(user_id,title,ai_analysis_id) values($1,$2,$3) returning id', [owner, 'real inquiry', id])).rows[0].id;
      await assert.rejects(query('update estimate_requests set ai_analysis_id=null where id=$1', [requestId]), /변경할 수/);
      await assert.rejects(query('insert into estimate_requests(user_id,title,ai_analysis_id) values($1,$2,$3)', [owner, 'duplicate', id]), /본인의|unique/);
    });
    assert.equal((await query('select linked_request_id from as_ai_analyses where id=$1', [id])).rows[0].linked_request_id, requestId);
    await asUser(admin, async () => {
      assert.equal((await query('select * from as_ai_analyses')).rows.length, 1, 'inquiry reader sees submitted result');
      assert.equal((await query("select * from storage.objects where bucket_id='as-analysis-media'")).rows.length, 0, 'analysis originals stay private; inquiry attachments are separate');
    });
    const content = JSON.stringify({ title: '검수 테스트', applicability: '테스트 범위', tools: ['도구'], steps: ['절차'], warnings: ['주의사항'], stop_conditions: ['중단조건'] });
    await asUser(owner, async () => {
      await assert.rejects(query('select save_as_repair_guide($1,$2,true,true)', ['cabinet_knob', content]), /관리자/);
      assert.equal((await query('select * from as_repair_guides')).rows.length, 0);
    });
    await asUser(admin, async () => {
      await assert.rejects(query('select save_as_repair_guide($1,$2,true,false)', ['cabinet_knob', content]), /검수/);
      await query('select save_as_repair_guide($1,$2,true,true)', ['cabinet_knob', content]);
    });
    await asUser(owner, async () => { assert.equal((await query('select * from as_repair_guides')).rows.length, 1); });
    for (let index = 2; index <= 5; index++) await reserve(`10000000-0000-4000-8000-00000000000${index}`);
    await assert.rejects(reserve('10000000-0000-4000-8000-000000000006'), /ANALYSIS_DAILY_LIMIT/);
    const retryId = '10000000-0000-4000-8000-000000000002';
    await asUser('', () => query('select claim_as_ai_analysis($1,$2,$3)', [retryId, owner, lease]), 'service_role');
    await query("update as_ai_analyses set processing_started_at=now()-interval '3 minutes' where id=$1", [retryId]);
    await asUser('', () => query('select claim_as_ai_analysis($1,$2,$3)', [retryId, owner, lease]), 'service_role');
    await query("update as_ai_analyses set status='failed' where id=$1", [retryId]);
    await assert.rejects(asUser('', () => query('select claim_as_ai_analysis($1,$2,$3)', [retryId, owner, lease]), 'service_role'), /ANALYSIS_RETRY_LIMIT/);
    await query("update as_ai_analyses set created_at=now()-interval '31 days'");
    assert.deepEqual((await query('select * from as_ai_expired_media()')).rows.map(row => row.path), [file]);
    await query('select purge_expired_as_ai_analyses()');
    assert.equal((await query('select count(*)::int as count from as_ai_analyses')).rows[0].count, 1, 'linked results are retained');
    await query('delete from estimate_requests where id=$1', [requestId]);
    assert.equal((await query('select purge_expired_as_ai_analyses()')).rows[0].purge_expired_as_ai_analyses, 0, 'do not orphan physical objects');
    await query("delete from storage.objects where bucket_id='as-analysis-media'");
    assert.equal((await query('select purge_expired_as_ai_analyses()')).rows[0].purge_expired_as_ai_analyses, 1);
    const textId = '10000000-0000-4000-8000-000000000010';
    const reserveText = (analysisId, media = '[]') => asUser('', () => query('select reserve_as_ai_analysis($1,$2,$3,$4)', [analysisId, other, '{"description":"손잡이가 헐거워요","media":[]}', media]), 'service_role');
    for (const media of ['null', '{}', JSON.stringify(Array(6).fill({}))]) await assert.rejects(reserveText(textId, media), /INVALID_MEDIA/);
    await reserveText(textId);
    await reserveText(textId);
    assert.equal((await query('select * from as_ai_media where analysis_id=$1', [textId])).rows.length, 0);
    await asUser(other, () => assert.rejects(query("insert into storage.objects(bucket_id,name) values('as-analysis-media',$1)", [`${other}/${textId}/0.jpg`]), /row-level security/));
    for (let index = 11; index <= 14; index++) await reserveText(`10000000-0000-4000-8000-0000000000${index}`);
    await assert.rejects(reserveText('10000000-0000-4000-8000-000000000015'), /ANALYSIS_DAILY_LIMIT/);
    await asUser('', () => query('select claim_as_ai_analysis($1,$2,$3)', [textId, other, lease]), 'service_role');
    const deletedAccountAnalysis = '10000000-0000-4000-8000-000000000007';
    await reserve(deletedAccountAnalysis);
    await query("update as_ai_analyses set status='completed', result=$2 where id=$1", [deletedAccountAnalysis, JSON.stringify({ schema_version: 1 })]);
    await asUser(owner, () => query('insert into estimate_requests(user_id,title,ai_analysis_id) values($1,$2,$3)', [owner, 'retained inquiry', deletedAccountAnalysis]));
    await query('delete from auth.users where id=$1', [owner]);
    assert.equal((await query("select ai_analysis_id from estimate_requests where title='retained inquiry'")).rows[0].ai_analysis_id, null, 'FK cleanup must not block account deletion');

    const completedQuota = readFileSync(path.join(__dirname, '../supabase/migrations/20260930000000_as_ai_completed_quota.sql'), 'utf8');
    await run(completedQuota);
    await run(completedQuota);
    const quotaId = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const service = fn => asUser('', fn, 'service_role');
    const reserveAnswer = (n, uid = other) => service(() => query('select reserve_as_ai_analysis($1,$2,$3,$4)', [quotaId(n), uid, '{}', '[]']));
    const claimAnswer = (n, leaseId = lease, uid = other) => service(() => query('select claim_as_ai_analysis($1,$2,$3)', [quotaId(n), uid, leaseId]));
    const completeAnswer = (n, leaseId = lease, uid = other, result = { schema_version: 1 }) => service(() => query('select complete_as_ai_analysis($1,$2,$3,$4,$5)', [quotaId(n), uid, leaseId, JSON.stringify(result), 'test-model']));
    const resetAnswers = () => query('delete from as_ai_analyses where user_id in ($1,$2)', [other, admin]);
    const endCooldown = () => query("update as_ai_analyses set processing_started_at=now()-interval '20 seconds', created_at=now()-interval '2 minutes' where user_id=$1", [other]);

    await t.test('failed and abandoned drafts do not consume the daily answer allowance, including existing failures', async () => {
      await resetAnswers();
      for (let n = 1; n <= 6; n++) {
        await reserveAnswer(n);
        await claimAnswer(n);
        await query("update as_ai_analyses set status='failed' where id=$1", [quotaId(n)]);
        await endCooldown();
      }
      await reserveAnswer(7);
      await claimAnswer(7);
      await completeAnswer(7);
      assert.equal((await query("select count(*)::int as count from as_ai_analyses where status='completed'")).rows[0].count, 1);
      assert.equal((await query("select count(*)::int as count from as_ai_analyses where status='failed'")).rows[0].count, 6);
    });

    await t.test('five saved answers block new and already reserved work, but not cached reads or other users', async () => {
      await resetAnswers();
      await reserveAnswer(99); // An old reservation must not bypass the execution check.
      await reserveAnswer(98);
      await claimAnswer(98);
      await query("update as_ai_analyses set status='failed' where id=$1", [quotaId(98)]);
      await endCooldown();
      let firstCompleted;
      for (let n = 1; n <= 5; n++) {
        await reserveAnswer(n);
        await claimAnswer(n);
        const answer = (await completeAnswer(n)).rows[0].complete_as_ai_analysis;
        assert.equal(answer.status, 'completed');
        assert.ok(answer.completed_at);
        if (n === 1) firstCompleted = answer;
        await endCooldown();
      }
      await assert.rejects(reserveAnswer(6), /ANALYSIS_DAILY_LIMIT/);
      await assert.rejects(claimAnswer(99), /ANALYSIS_DAILY_LIMIT/);
      await assert.rejects(claimAnswer(98), /ANALYSIS_DAILY_LIMIT/);
      assert.equal((await claimAnswer(1)).rows[0].claim_as_ai_analysis.status, 'completed');
      assert.equal((await reserveAnswer(1)).rows[0].reserve_as_ai_analysis.status, 'completed');
      const again = (await completeAnswer(1, lease, other, { schema_version: 1, changed: true })).rows[0].complete_as_ai_analysis;
      assert.deepEqual(again.result, firstCompleted.result);
      assert.equal(again.completed_at, firstCompleted.completed_at);
      await reserveAnswer(100, admin);
      await claimAnswer(100, lease, admin);
      await completeAnswer(100, lease, admin);
      // Recent completions still count even if their draft is more than 24h old.
      await query("update as_ai_analyses set created_at=now()-interval '25 hours' where user_id=$1 and status='completed'", [other]);
      await assert.rejects(reserveAnswer(6), /ANALYSIS_DAILY_LIMIT/);
      await query("update as_ai_analyses set completed_at=now()-interval '24 hours 1 second' where id=$1", [quotaId(1)]);
      await claimAnswer(99);
      await completeAnswer(99);
      await assert.rejects(reserveAnswer(6), /ANALYSIS_DAILY_LIMIT/);
    });

    await t.test('short-window throttling is separate from daily quota and retains bounded retries', async () => {
      await resetAnswers();
      for (let n = 1; n <= 5; n++) await reserveAnswer(n);
      await assert.rejects(reserveAnswer(6), /ANALYSIS_RATE_LIMIT/);
      await reserveAnswer(1); // Duplicate prepares stay idempotent even during cooldown.
      await claimAnswer(1);
      await assert.rejects(claimAnswer(2), /ANALYSIS_BUSY/);
      await query("update as_ai_analyses set status='failed' where id=$1", [quotaId(1)]);
      await assert.rejects(claimAnswer(1), /ANALYSIS_RATE_LIMIT/);
      await assert.rejects(claimAnswer(2), /ANALYSIS_RATE_LIMIT/);
      await endCooldown();
      await claimAnswer(1);
      await query("update as_ai_analyses set status='failed' where id=$1", [quotaId(1)]);
      await endCooldown();
      await assert.rejects(claimAnswer(1), /ANALYSIS_RETRY_LIMIT/);
      await reserveAnswer(6);
      await claimAnswer(6);
      await completeAnswer(6);
    });

    await t.test('expired workers and wrong leases cannot save or charge an answer', async () => {
      await resetAnswers();
      const nextLease = '20000000-0000-4000-8000-000000000002';
      await reserveAnswer(1);
      await reserveAnswer(2);
      await claimAnswer(1);
      await assert.rejects(completeAnswer(1, nextLease), /ANALYSIS_LEASE_EXPIRED/);
      await assert.rejects(completeAnswer(1, lease, admin), /ANALYSIS_NOT_FOUND/);
      await assert.rejects(completeAnswer(1, lease, other, {}), /INVALID_ANALYSIS_RESULT/);
      await query("update as_ai_analyses set processing_started_at=now()-interval '3 minutes' where id=$1", [quotaId(1)]);
      await assert.rejects(completeAnswer(1), /ANALYSIS_LEASE_EXPIRED/);
      await claimAnswer(2, nextLease);
      const stale = (await query('select * from as_ai_analyses where id=$1', [quotaId(1)])).rows[0];
      assert.equal(stale.status, 'failed');
      assert.equal(stale.lease_id, null);
      await assert.rejects(completeAnswer(1), /ANALYSIS_LEASE_EXPIRED/);
      await completeAnswer(2, nextLease);
      assert.equal((await query("select count(*)::int as count from as_ai_analyses where status='completed'")).rows[0].count, 1);
    });

    await t.test('completion rechecks quota and is callable only by the service role', async () => {
      await resetAnswers();
      await reserveAnswer(1);
      await claimAnswer(1);
      for (const role of ['anon', 'authenticated']) {
        await asUser(other, () => assert.rejects(query('select complete_as_ai_analysis($1,$2,$3,$4,$5)', [quotaId(1), other, lease, '{"schema_version":1}', 'test-model']), /permission denied/), role);
      }
      for (let n = 2; n <= 6; n++) {
        await query("insert into as_ai_analyses(id,user_id,input_payload,status,result,completed_at) values($1,$2,'{}','completed','{\"schema_version\":1}',now())", [quotaId(n), other]);
      }
      await assert.rejects(completeAnswer(1), /ANALYSIS_DAILY_LIMIT/);
      assert.equal((await query('select status from as_ai_analyses where id=$1', [quotaId(1)])).rows[0].status, 'processing');
      await query("update as_ai_analyses set completed_at=null where id=$1", [quotaId(2)]);
      await run(completedQuota);
      assert.equal((await query('select completed_at=created_at as backfilled from as_ai_analyses where id=$1', [quotaId(2)])).rows[0].backfilled, true);
      await assert.rejects(completeAnswer(1), /ANALYSIS_DAILY_LIMIT/);
    });
  } finally { await db.close(); }
});
