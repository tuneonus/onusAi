// Explicit live smoke test: existing compiled Express API + isolated PostgreSQL
// schema + real browser. Never uses or changes existing businesses or accounts.
// Requires TEST_DATABASE_URL and the browser variables used in staff.browser.mjs.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

test('live assistant creation, draft updates, publishing and operator read-only access', { timeout: 45000 }, async (t) => {
  assert.ok(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL must explicitly enable the live test');
  assert.ok(process.env.PLAYWRIGHT_MODULE_PATH, 'Existing Playwright Core is required');
  assert.ok(process.env.CHROMIUM_EXECUTABLE_PATH, 'Existing Chromium is required');
  const requireBackend = createRequire(new URL('../../../backend/package.json', import.meta.url));
  const { Pool } = requireBackend('pg');
  const observer = new Pool({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 2000 });
  const schema = `onusai_f5_test_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  let closeDatabasePool;
  t.after(async () => {
    try {
      await closeDatabasePool?.();
      if (created) await observer.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally { await observer.end(); }
  });
  await observer.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  const scopedUrl = new URL(process.env.TEST_DATABASE_URL);
  scopedUrl.searchParams.set('options', `-c search_path=${schema},pg_catalog`);
  const dashboardUrl = process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5173';
  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '3000', CORS_ORIGIN: new URL(dashboardUrl).origin,
    DATABASE_URL: scopedUrl.href,
    AI_SERVICE_URL: 'http://127.0.0.1:1', AI_SERVICE_TIMEOUT_MS: '200',
    AI_INTERNAL_AUTH_SECRET: randomUUID() + randomUUID(),
    AUTH_SESSION_TTL_MS: '600000',
  });
  const database = await import(new URL('../../../backend/dist/integrations/database/postgres.js', import.meta.url));
  closeDatabasePool = database.closeDatabasePool;
  const { postgresPool } = database;
  const { runMigrations } = await import(new URL('../../../backend/dist/integrations/database/migrations.js', import.meta.url));
  const { hashPassword } = await import(new URL('../../../backend/dist/utils/password.js', import.meta.url));
  const { app } = await import(new URL('../../../backend/dist/app.js', import.meta.url));
  await runMigrations();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const apiUrl = `http://127.0.0.1:${server.address().port}`;

  const businessIds = [];
  for (const name of ['F5 Northstar Test', 'F5 Beacon Test', 'F5 Foreign Test']) {
    businessIds.push((await postgresPool.query('INSERT INTO businesses (name) VALUES ($1) RETURNING id', [name])).rows[0].id);
  }
  const password = randomUUID() + 'F5-test';
  const users = [];
  for (const [email, name] of [['f5-owner@example.test', 'F5 Owner'], ['f5-operator@example.test', 'F5 Operator']]) {
    const userId = (await postgresPool.query('INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id', [email, name])).rows[0].id;
    await postgresPool.query('INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)', [userId, await hashPassword(password)]);
    users.push(userId);
  }
  for (const [businessId, userId, role] of [
    [businessIds[0], users[0], 'owner'], [businessIds[1], users[0], 'owner'],
    [businessIds[0], users[1], 'operator'],
  ]) {
    await postgresPool.query('INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, $3)', [businessId, userId, role]);
  }

  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, headless: true });
  t.after(() => browser.close());

  async function signedInPage(email) {
    const context = await browser.newContext();
    const login = await context.request.post(`${apiUrl}/api/v1/auth/login`, { data: { email, password } });
    assert.equal(login.status(), 200);
    const session = await login.json();
    const page = await context.newPage();
    // Transparent transport to the isolated API; response bodies are never mocked.
    await page.route('**/api/v1/**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const response = await route.fetch({ url: `${apiUrl}${requestUrl.pathname}${requestUrl.search}` });
      await route.fulfill({ response });
    });
    return { context, page, session };
  }

  const owner = await signedInPage('f5-owner@example.test');
  await owner.page.goto(`${dashboardUrl}/staff`);
  await owner.page.getByRole('rowheader', { name: 'F5 Owner You', exact: true }).waitFor();
  assert.deepEqual(await owner.page.locator('.staff-page__metric-value').allTextContents(), ['2', '1', '1']);
  const realMembers = await owner.context.request.get(`${apiUrl}/api/v1/businesses/${businessIds[0]}/members`);
  assert.equal(realMembers.status(), 200);
  assert.equal(realMembers.headers()['cache-control'], 'no-store');
  const body = await realMembers.json();
  assert.equal(body.businessId, businessIds[0]);
  assert.equal(body.members.length, 2);
  assert.deepEqual(Object.keys(body.members[0]).sort(), ['membershipId', 'userId', 'displayName', 'email', 'role', 'createdAt'].sort());

  await owner.page.locator('#workspace-switcher-select').selectOption(businessIds[1]);
  await owner.page.waitForFunction(() => document.querySelector('.staff-page__metric-value')?.textContent === '1');
  assert.equal(await owner.page.getByText('f5-operator@example.test', { exact: true }).count(), 0);
  const foreign = await owner.context.request.get(`${apiUrl}/api/v1/businesses/${businessIds[2]}/members`);
  assert.equal(foreign.status(), 403);

  const operator = await signedInPage('f5-operator@example.test');
  let operatorMembersRequests = 0;
  operator.page.on('request', (request) => { if (request.url().endsWith('/members')) operatorMembersRequests++; });
  await operator.page.goto(`${dashboardUrl}/staff`);
  await operator.page.getByRole('heading', { name: 'Staff directory access denied' }).waitFor();
  assert.equal(operatorMembersRequests, 0);
  assert.equal(await operator.page.locator('a[href="/staff"]').count(), 0);
  const forbidden = await operator.context.request.get(`${apiUrl}/api/v1/businesses/${businessIds[0]}/members`);
  assert.equal(forbidden.status(), 403);
  assert.equal((await forbidden.json()).error.code, 'INSUFFICIENT_PERMISSIONS');

  await owner.page.goto(`${dashboardUrl}/assistants`);
  await owner.page.getByRole('button',{name:'Create assistant',exact:true}).click();
  await owner.page.getByLabel('Assistant name').fill('Live F6 Assistant');
  await owner.page.getByRole('tab',{name:'Behavior',exact:true}).click();
  await owner.page.getByLabel('System instructions').fill('Help customers with clear answers.');
  await owner.page.getByRole('tab',{name:'Messages',exact:true}).click();
  await owner.page.getByLabel('Welcome message').fill('Welcome!');
  await owner.page.getByRole('tab',{name:'Messages',exact:true}).click();
  await owner.page.getByLabel('Fallback message').fill('Please contact our team.');
  await owner.page.getByRole('button',{name:'Save Draft',exact:true}).click();
  await owner.page.getByText('Assistant created with draft v1.',{exact:true}).waitFor();
  await owner.page.getByLabel('Assistant name').fill('Updated F6 Assistant');
  await owner.page.getByRole('button',{name:'Save Draft',exact:true}).click();
  await owner.page.getByText('Draft saved successfully.',{exact:true}).waitFor();
  await owner.page.getByRole('button',{name:'Publish saved draft',exact:true}).click();
  await owner.page.getByRole('dialog').waitFor();
  await owner.page.getByRole('button',{name:'Publish version',exact:true}).click();
  await owner.page.getByText('Version published successfully.',{exact:true}).waitFor();
  await owner.page.getByRole('button',{name:'Create new draft',exact:true}).click();
  await owner.page.getByText('New draft created from the latest version.',{exact:true}).waitFor();
  const rows=await postgresPool.query('SELECT status, version_number, display_name FROM assistant_versions ORDER BY version_number');
  assert.deepEqual(rows.rows.map(r=>r.status),['published','draft']);
  assert.ok(rows.rows.every(r=>r.display_name==='Updated F6 Assistant'));
  await owner.page.screenshot({path:'/tmp/assistants-live.png',fullPage:true,animations:'disabled'});
  await postgresPool.query('INSERT INTO business_members (business_id,user_id,role) VALUES ($1,$2,$3)',[businessIds[1],users[1],'operator']);
  await operator.page.goto(`${dashboardUrl}/assistants`);
  await operator.page.getByText('Read-only operator access',{exact:true}).waitFor();
  assert.equal(await operator.page.getByRole('button',{name:'Create assistant',exact:true}).count(),0);
  await operator.page.locator('#workspace-switcher-select').selectOption(businessIds[1]);
  await operator.page.getByRole('button',{name:/Updated F6 Assistant/}).click();
  assert.equal(await operator.page.getByLabel('Assistant name').isDisabled(),true);
  assert.equal(await operator.page.getByRole('button',{name:'Save Draft',exact:true}).count(),0);
  const deniedWrite=await operator.context.request.post(`${apiUrl}/api/v1/businesses/${businessIds[1]}/assistants`,{headers:{'X-CSRF-Token':operator.session.session.csrfToken},data:{}});
  assert.equal(deniedWrite.status(),403);

  await owner.page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await owner.page.waitForURL('**/login');
  const signedOut = await owner.context.request.get(`${apiUrl}/api/v1/businesses/${businessIds[0]}/members`);
  assert.equal(signedOut.status(), 401);
  const revoked = await postgresPool.query('SELECT revoked_at FROM staff_sessions WHERE user_id = $1', [users[0]]);
  assert.ok(revoked.rows.every((row) => row.revoked_at));
  assert.equal(await owner.page.locator('.staff-table').count(), 0);
  await owner.context.close();
  await operator.context.close();
});
