// Uses mocked network responses. No customer data or live Supabase writes are made.
// NODE_PATH=/path/to/playwright/node_modules node tests/asAnalysis.browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const env = require('dotenv').parse(readFileSync(path.join(root, '.env')));
const project = new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const base = process.env.AS_TEST_URL || 'http://localhost:8081';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'as-test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=', 'base64');
const guide = { key: 'cabinet_knob', title: '수납장 손잡이 교체', applicability: '테스트용 적용 범위', tools: ['테스트용 준비물'], steps: ['검수된 테스트 절차'], warnings: ['테스트용 주의사항'], stop_conditions: ['테스트용 중단 조건'], status: 'published', reviewed_at: '2026-09-28T00:00:00Z', reviewed_by: user.id };
const result = {
  schema_version: 1, source: 'ai', issue_area: '수납장 손잡이', problem_summary: '손잡이 고정부가 헐거워진 것으로 보입니다.', observations: ['손잡이에 틈이 보입니다.'], possible_causes: ['고정부의 느슨함'], hazards: [], safety_uncertain: false, risk_level: 'low', recommended_action: 'self_repair', repairability: 'replacement_possible', reason: '사진 속 손잡이가 적용 범위와 일치합니다.', follow_up_questions: [], limitations: ['내부는 확인할 수 없습니다.'], diy_possible: true, expert_required: false, guide, safety_warning: '실제 상태가 다르면 작업을 중단하세요.', guide_pending_review: false,
};
async function setup(browser, width, colorScheme, mode = 'success', admin = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
  const payload = { sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url'), 'test-signature'].join('.');
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${project}-auth-token`, session: { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: payload.exp, user } });
  const requests = [];
  const records = new Map();
  await context.route('**/*.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    let body;
    try { body = request.postDataJSON(); } catch { body = null; }
    requests.push({ path: url.pathname, method: request.method(), body });
    let data = []; let status = 200;
    const table = url.pathname.split('/').pop();
    if (url.pathname.includes('/auth/v1/user')) data = user;
    else if (table === 'analyze-as-issue') {
      if (mode === 'admin-only') { status = 403; data = { error: 'AI 답변은 현재 관리자 테스트 중입니다. 답변 없이 상담을 요청해 주세요.' }; }
      else if (mode === 'unavailable') { status = 503; data = { error: 'AI 분석은 아직 준비 중입니다. 아래에서 바로 상담을 요청할 수 있습니다.' }; }
      else if (mode === 'daily-limit' && body.action === 'prepare') { status = 429; data = { code: 'ANALYSIS_DAILY_LIMIT', error: '최근 24시간 동안 분석 답변 5회를 모두 이용했습니다. 실패한 분석은 횟수에 포함되지 않습니다.' }; }
      else if (mode === 'rate-limit' && body.action === 'prepare') { status = 429; data = { code: 'ANALYSIS_RATE_LIMIT', error: '요청이 너무 빠르게 이어지고 있습니다. 잠시 후 다시 시도해 주세요. 실패한 분석은 이용 횟수에 포함되지 않습니다.' }; }
      else if (body.action === 'prepare') {
        const record = records.get(body.id) ?? { id: body.id, status: 'uploading', result: null, error_message: null, created_at: new Date().toISOString(), textOnly: body.input.media.length === 0 };
        records.set(body.id, record);
        data = { analysis: record, media: body.input.media.map((media, index) => ({ ...media, path: `${user.id}/${body.id}/${index}.png` })) };
      } else if (body.action === 'analyze') {
        await new Promise(resolve => setTimeout(resolve, 150));
        const previous = records.get(body.id);
        if (['retry-limit', 'legacy-retry-limit', 'expired'].includes(mode) && body.id === records.keys().next().value) {
          status = 409;
          data = { ...(mode === 'legacy-retry-limit' ? {} : { code: mode === 'expired' ? 'ANALYSIS_EXPIRED' : 'ANALYSIS_RETRY_LIMIT' }), error: mode === 'expired' ? '첨부 대기 시간이 지났습니다. 새 분석을 시작해 주세요.' : '이 분석의 재시도 횟수를 초과했습니다. 새 분석이나 상담을 요청해 주세요.' };
          records.set(body.id, { ...previous, status: 'failed' });
        } else if (mode === 'temporary' && previous.status === 'uploading') {
          status = 502; data = { code: 'GEMINI_ANALYZE_503_UNAVAILABLE', error: '테스트용 일시 장애' };
          records.set(body.id, { ...previous, status: 'failed' });
        } else {
          const textResult = { ...result, observations: [], recommended_action: 'needs_more_info', diy_possible: null, expert_required: null, guide: null, reason: '작성한 증상만으로는 고정 상태를 확인할 수 없습니다.', limitations: ['사진·영상 없이 작성한 증상만으로 추정했습니다.'] };
          const faucetResult = { ...textResult, issue_area: '세면대 수도꼭지', problem_summary: '수도꼭지에서 물이 샌다고 설명했습니다.', possible_causes: ['수전 부품의 마모 가능성'], reason: '누수 위치와 정도를 추가로 확인해야 합니다.', safety_uncertain: true, risk_level: 'unknown', follow_up_questions: ['주변 콘센트에 물이 닿았나요?'] };
          const record = { ...previous, status: 'completed', result: mode === 'water' ? faucetResult : previous.textOnly ? textResult : result };
          records.set(body.id, record); data = { analysis: record };
        }
      } else data = { analysis: records.get(body.id) };
    } else if (url.pathname.includes('/functions/')) data = { ok: true };
    else if (url.pathname.includes('/storage/')) data = { Key: 'test-object' };
    else if (table === 'profiles') data = url.searchParams.get('user_type') === 'eq.store' ? [{ id: '00000000-0000-4000-8000-000000000002', display_name: '테스트 수리가게', user_type: 'store', business_verified: true, store_category: 'interior', status: 'active' }] : [{ id: user.id, display_name: '테스트 사용자', user_type: 'personal', status: 'active', role: admin ? 'admin' : 'user', business_verified: false }];
    else if (table === 'as_repair_guides') data = admin ? [{ ...guide, status: 'draft', steps: [] }] : [guide];
    else if (table === 'save_as_repair_guide') data = { ...guide, ...body.p_content, status: body.p_publish ? 'published' : 'draft' };
    else if (table === 'as_ai_analyses') data = [...records.values()];
    else if (table === 'estimate_requests' && request.method() === 'POST') data = { id: 999 };
    else if (table === 'estimate_request_images' && request.method() === 'POST') data = {};
    if (Array.isArray(data) && request.headers().accept?.includes('vnd.pgrst.object')) data = data[0] ?? null;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'content-range': '0-0/1' } });
  });
  await context.routeWebSocket('wss://*.supabase.co/**', socket => socket.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  return { context, page, requests, errors };
}
async function visitForm(page) {
  await page.goto(`${base}/estimate/create`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('as-analysis-panel').waitFor({ timeout: 60000 });
}
async function prepare(page, withPhoto = true) {
  await page.getByRole('textbox', { name: '상세 내용', exact: true }).fill('가벼운 수납장 손잡이가 헐거워요');
  if (withPhoto) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '사진 촬영 또는 선택', exact: true }).click();
    await (await chooser).setFiles({ name: 'handle.png', mimeType: 'image/png', buffer: png });
  }
  await page.getByRole('radio', { name: '아니요', exact: true }).click();
  await page.getByRole('checkbox', { name: 'AI 분석 전송 동의', exact: true }).click();
}
async function assertNoOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, 'page overflows horizontally');
  const controls = await page.getByTestId('as-analysis-panel').getByRole('button').all();
  for (const control of controls) {
    const box = await control.boundingBox();
    if (box) assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1, 'button clipped');
  }
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    for (const [width, scheme] of [[320, 'dark'], [390, 'light'], [1440, 'dark']]) {
      const { context, page, requests, errors } = await setup(browser, width, scheme);
      await visitForm(page);
      await page.screenshot({ path: `/private/tmp/as-ai-question-${scheme}-${width}.png` });
      assert.equal(await page.getByRole('textbox', { name: '신청자 이름, 필수' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: '견적 및 상담 요청하기', exact: true }).count(), 0);
      await page.getByRole('button', { name: '질문하기', exact: true }).click();
      await page.getByText('증상을 선택하거나 간단히 입력해 주세요.', { exact: true }).waitFor();
      assert.equal(requests.filter(item => item.path.endsWith('/analyze-as-issue')).length, 0);
      await prepare(page, width !== 390);
      await page.getByRole('button', { name: '질문하기', exact: true }).click();
      await page.getByRole('button', { name: '문의하기', exact: true }).waitFor();
      await page.getByText(width === 390 ? '사진·영상 없이 작성한 증상만으로 추정했습니다.' : '검수된 테스트 절차', { exact: true }).waitFor();
      assert.equal(requests.filter(item => item.body?.action === 'analyze').length, 1);
      assert.equal(requests.filter(item => item.path.endsWith('/estimate_requests') && item.method === 'POST').length, 0, 'analysis must not create an inquiry');
      assert.equal(await page.getByRole('textbox', { name: '신청자 이름, 필수' }).count(), 0, 'contact stays hidden until consultation is requested');
      if (width === 390) {
        assert.deepEqual(requests.find(item => item.body?.action === 'prepare').body.input.media, []);
        assert.equal(requests.filter(item => item.path.includes('/storage/')).length, 0);
      }
      await assertNoOverflow(page);
      await page.getByTestId('as-analysis-result').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/private/tmp/as-ai-result-${scheme}-${width}.png` });
      await page.getByRole('button', { name: '문의하기', exact: true }).click();
      await page.getByRole('textbox', { name: '신청자 이름, 필수' }).fill('테스트');
      await page.getByRole('textbox', { name: '신청자 전화번호, 필수' }).fill('01012345678');
      await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
      await page.getByRole('button', { name: '문의하기', exact: true }).waitFor();
      if (width === 320) {
        await page.getByRole('button', { name: '질문 수정하기', exact: true }).click();
        await page.getByRole('textbox', { name: '상세 내용', exact: true }).fill('손잡이 상태가 바뀌었어요');
        assert.equal(await page.getByTestId('as-analysis-result').count(), 0, 'stale result remains visible');
        await page.getByRole('checkbox', { name: 'AI 답변 없이 바로 상담', exact: true }).click();
        await page.getByRole('button', { name: '상담 정보 입력하기', exact: true }).click();
      } else await page.getByRole('button', { name: '문의하기', exact: true }).click();
      assert.equal(await page.getByRole('textbox', { name: '신청자 이름, 필수' }).inputValue(), '테스트');
      assert.equal(await page.getByRole('textbox', { name: '신청자 전화번호, 필수' }).inputValue(), '01012345678');
      if (width === 390) {
        await page.getByRole('button', { name: /상담 받을 가게 \(선택\)/ }).click();
        await page.getByText('테스트 수리가게', { exact: true }).click();
      }
      await assertNoOverflow(page);
      await page.getByRole('textbox', { name: '신청자 이름, 필수' }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/private/tmp/as-ai-contact-${scheme}-${width}.png` });
      const notification = page.waitForResponse(response => response.url().includes('/send-estimate-request-notification') && response.request().method() === 'POST');
      await page.getByRole('button', { name: '견적 및 상담 요청하기', exact: true }).last().click();
      await page.waitForURL('**/home', { timeout: 20000 });
      await notification;
      const inquiry = requests.find(item => item.path.endsWith('/estimate_requests') && item.method === 'POST');
      assert.ok(inquiry);
      assert.equal(Boolean(inquiry.body.ai_analysis_id), width !== 320, 'analysis linkage does not match current input');
      assert.equal(inquiry.body.routing_status, width === 390 ? 'store_selected' : 'admin_pending');
      assert.equal(requests.filter(item => item.path.endsWith('/send-estimate-request-notification')).length, 1);
      assert.deepEqual(errors, []);
      await context.close();
    }
    for (const [width, scheme] of [[320, 'dark'], [390, 'light']]) {
      const { context, page, requests, errors } = await setup(browser, width, scheme, 'water');
      await visitForm(page);
      await page.getByRole('checkbox', { name: '물이 새요', exact: true }).click();
      await page.getByRole('textbox', { name: '상세 내용', exact: true }).fill('화장실 세면대 수도꼭지에서 물이 샌다');
      assert.equal(await page.getByTestId('as-analysis-result').count(), 0, 'ordinary water text must not show a static danger result');
      await page.getByRole('radio', { name: '아니요', exact: true }).click();
      await page.getByRole('checkbox', { name: 'AI 분석 전송 동의', exact: true }).click();
      await page.getByRole('button', { name: '질문하기', exact: true }).click();
      await page.getByRole('button', { name: '문의하기', exact: true }).waitFor();
      const answer = page.getByTestId('as-analysis-result');
      await answer.getByText('추가 확인이 필요해요', { exact: true }).waitFor();
      await answer.getByText('주변 콘센트에 물이 닿았나요?', { exact: true }).waitFor();
      assert.equal(await answer.getByText(/위험 가능성이 있는 증상|셀프 수리 제외|긴급한 위험/).count(), 0);
      assert.deepEqual(requests.find(item => item.body?.action === 'prepare').body.input.symptoms, ['물이 새요']);
      assert.equal(requests.filter(item => item.body?.action === 'analyze').length, 1);
      await assertNoOverflow(page);
      await answer.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/private/tmp/as-ai-water-${scheme}-${width}.png` });
      assert.deepEqual(errors, []);
      await context.close();
    }
    for (const mode of ['retry-limit', 'legacy-retry-limit', 'expired']) {
      const { context, page, requests, errors } = await setup(browser, 320, 'dark', mode);
      await visitForm(page); await prepare(page, mode === 'retry-limit');
      await page.getByRole('button', { name: '질문하기', exact: true }).click();
      const restart = page.getByRole('button', { name: '새 분석으로 질문하기', exact: true });
      await restart.waitFor();
      assert.equal(requests.filter(item => item.body?.action === 'prepare').length, 1, 'no automatic provider-consuming restart');
      assert.ok((await page.getByRole('alert').innerText()).includes('실패한 분석은 이용 횟수에 포함되지 않습니다.'));
      assert.equal(await page.getByRole('textbox', { name: '상세 내용', exact: true }).inputValue(), '가벼운 수납장 손잡이가 헐거워요');
      const consentControl = page.getByRole('checkbox', { name: 'AI 분석 전송 동의', exact: true });
      assert.equal(await consentControl.isChecked(), true, await consentControl.evaluate(node => node.outerHTML));
      await assertNoOverflow(page);
      await page.getByTestId('as-analysis-panel').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/private/tmp/as-ai-${mode}-dark-320.png` });
      await restart.evaluate(node => { node.click(); node.click(); });
      await page.getByRole('button', { name: '문의하기', exact: true }).waitFor();
      const preparations = requests.filter(item => item.body?.action === 'prepare');
      assert.equal(preparations.length, 2, 'double tap must start only one fresh analysis');
      assert.notEqual(preparations[0].body.id, preparations[1].body.id);
      assert.deepEqual(preparations[0].body.input, preparations[1].body.input, 'retain the symptom and attachment manifest');
      const attempts = requests.filter(item => item.body?.action === 'analyze');
      assert.equal(attempts.length, 2);
      assert.equal(attempts[1].body.id, preparations[1].body.id);
      assert.equal(requests.filter(item => item.path.endsWith('/estimate_requests') && item.method === 'POST').length, 0);
      assert.deepEqual(errors, []); await context.close();
    }
    for (const mode of ['temporary', 'daily-limit', 'rate-limit']) {
      const { context, page, requests, errors } = await setup(browser, 390, 'light', mode);
      await visitForm(page); await prepare(page, false);
      await page.getByRole('button', { name: '질문하기', exact: true }).click();
      await page.getByRole('button', { name: '다시 질문하기', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '새 분석으로 질문하기', exact: true }).count(), 0);
      if (mode === 'temporary') {
        await page.getByRole('button', { name: '다시 질문하기', exact: true }).click();
        await page.getByRole('button', { name: '문의하기', exact: true }).waitFor();
        const preparations = requests.filter(item => item.body?.action === 'prepare');
        assert.equal(preparations.length, 2);
        assert.equal(preparations[0].body.id, preparations[1].body.id, 'temporary failure must reuse the ID');
      } else {
        assert.equal(requests.filter(item => item.body?.action === 'prepare').length, 1);
        assert.equal(requests.filter(item => item.body?.action === 'analyze').length, 0);
        await page.getByRole('button', { name: '답변 없이 문의하기', exact: true }).click();
        await page.getByRole('textbox', { name: '신청자 이름, 필수' }).waitFor();
      }
      assert.deepEqual(errors, []); await context.close();
    }
    for (const mode of ['unavailable', 'admin-only']) {
      const { context, page, requests, errors } = await setup(browser, 320, 'dark', mode);
      await visitForm(page); await prepare(page, false);
      await page.getByRole('button', { name: '질문하기', exact: true }).click();
      await page.getByText(mode === 'admin-only' ? 'AI 답변은 현재 관리자 테스트 중입니다. 답변 없이 상담을 요청해 주세요.' : 'AI 분석은 아직 준비 중입니다. 아래에서 바로 상담을 요청할 수 있습니다.', { exact: true }).waitFor();
      await page.getByRole('button', { name: '답변 없이 문의하기', exact: true }).click();
      await page.getByRole('textbox', { name: '신청자 이름, 필수' }).waitFor();
      await page.getByRole('button', { name: '질문 수정하기', exact: true }).click();
      await page.getByRole('textbox', { name: '상세 내용', exact: true }).fill('가스 냄새가 나요');
      await page.getByText('긴급한 위험이 의심돼요', { exact: true }).waitFor();
      await page.getByRole('checkbox', { name: 'AI 답변 없이 바로 상담', exact: true }).click();
      assert.equal(await page.getByText('긴급한 위험이 의심돼요', { exact: true }).isVisible(), true, 'skip AI must not hide the immediate safety warning');
      assert.equal(requests.filter(item => item.body?.action === 'analyze').length, 0);
      assert.equal(await page.getByText('셀프 수리 방법', { exact: true }).count(), 0);
      await assertNoOverflow(page);
      await page.getByTestId('as-analysis-result').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/private/tmp/as-ai-emergency-dark-320.png' });
      assert.deepEqual(errors, []); await context.close();
    }
    {
      const { context, page, requests, errors } = await setup(browser, 320, 'dark');
      await visitForm(page);
      await page.getByRole('textbox', { name: '상세 내용', exact: true }).fill('손잡이가 헐거워요');
      await page.getByRole('radio', { name: '해당해요', exact: true }).click();
      await page.getByRole('checkbox', { name: '전기', exact: true }).click();
      await page.getByText('전문가 점검이 필요해요', { exact: true }).waitFor();
      await page.getByRole('checkbox', { name: '전기', exact: true }).click();
      assert.equal(await page.getByTestId('as-analysis-result').count(), 0, 'mistaken hazard choice can be undone');
      await page.getByRole('textbox', { name: '상세 내용', exact: true }).fill('가스 냄새가 나요');
      await page.getByRole('button', { name: '질문하기', exact: true }).click();
      await page.getByRole('button', { name: '문의하기', exact: true }).waitFor();
      assert.equal(await page.getByText('위험 확인 결과 · AI 미분석', { exact: true }).isVisible(), true);
      assert.equal(requests.filter(item => item.path.endsWith('/analyze-as-issue')).length, 0, 'known hazards use immediate safety guidance without external AI');
      await page.getByRole('button', { name: '문의하기', exact: true }).click();
      await page.getByRole('textbox', { name: '신청자 이름, 필수' }).waitFor();
      assert.deepEqual(errors, []); await context.close();
    }
    {
      const { context, page, requests, errors } = await setup(browser, 390, 'light');
      await visitForm(page);
      await page.getByRole('checkbox', { name: 'AI 답변 없이 바로 상담', exact: true }).click();
      await page.getByRole('button', { name: '상담 정보 입력하기', exact: true }).click();
      await page.getByText('증상을 선택하거나 간단히 입력해 주세요.', { exact: true }).waitFor();
      await page.getByRole('checkbox', { name: '문이 잘 안 닫혀요', exact: true }).click();
      await page.getByRole('button', { name: '상담 정보 입력하기', exact: true }).click();
      await page.getByRole('button', { name: '견적 및 상담 요청하기', exact: true }).click();
      await page.getByText('신청자 이름을 입력해 주세요.', { exact: true }).waitFor();
      await page.getByRole('textbox', { name: '신청자 이름, 필수' }).fill('직접상담');
      await page.getByRole('textbox', { name: '신청자 전화번호, 필수' }).fill('01012345678');
      const notification = page.waitForResponse(response => response.url().includes('/send-estimate-request-notification') && response.request().method() === 'POST');
      await page.getByRole('button', { name: '견적 및 상담 요청하기', exact: true }).click();
      await page.waitForURL('**/home', { timeout: 20000 });
      await notification;
      assert.equal(requests.filter(item => item.path.endsWith('/analyze-as-issue')).length, 0, 'skip flow must never contact AI');
      assert.equal(requests.filter(item => item.path.includes('/storage/')).length, 0);
      const submitted = requests.find(item => item.path.endsWith('/estimate_requests') && item.method === 'POST');
      assert.equal(submitted.body.ai_analysis_id, undefined);
      assert.match(submitted.body.description, /문이 잘 안 닫혀요/);
      assert.deepEqual(errors, []); await context.close();
    }
    {
      const { context, page, requests, errors } = await setup(browser, 390, 'dark', 'success', true);
      await page.goto(`${base}/admin/as-guides`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /수납장 손잡이 교체/ }).waitFor({ timeout: 60000 });
      await page.getByRole('button', { name: /수납장 손잡이 교체/ }).click();
      await page.getByRole('textbox', { name: '작업 절차', exact: true }).fill('관리자가 검토한 테스트 절차');
      assert.equal(await page.getByRole('button', { name: '검수 완료 후 게시', exact: true }).isDisabled(), true);
      await page.getByRole('checkbox', { name: '가이드 안전 검수 완료', exact: true }).click();
      await page.getByRole('button', { name: '검수 완료 후 게시', exact: true }).click();
      await page.getByText('검수된 가이드를 게시했습니다.', { exact: true }).waitFor();
      assert.equal(requests.filter(item => item.path.endsWith('/save_as_repair_guide')).length, 1);
      assert.deepEqual(errors, []); await context.close();
    }
    console.log('AS AI browser checks passed: staged flow, retry-limit recovery, legacy errors, double-tap guard, daily quota, optional media, skip AI, retained drafts, store routing, risk block, unavailable service, stale linkage, mobile/desktop, light/dark, guide review.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
