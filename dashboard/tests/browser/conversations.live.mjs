// Explicit live smoke test: existing compiled Express API + isolated PostgreSQL
// schema + real browser. Never uses or changes existing businesses or accounts.
// Requires TEST_DATABASE_URL and the browser variables used in staff.browser.mjs.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

test('live Gemini playground: two turns, context, persistence, replay, refresh and outage', { timeout: 90000 }, async (t) => {
  assert.ok(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL must explicitly enable the live test');
  assert.ok(process.env.PLAYWRIGHT_MODULE_PATH, 'Existing Playwright Core is required');
  assert.ok(process.env.CHROMIUM_EXECUTABLE_PATH, 'Existing Chromium is required');
  const requireBackend = createRequire(new URL('../../../backend/package.json', import.meta.url));
  const { Pool } = requireBackend('pg');
  const observer = new Pool({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 2000 });
  const schema = `onussync_f5_test_${randomUUID().replaceAll('-', '')}`;
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
  const aiDirectory = new URL('../../../ai-backend/',import.meta.url);
  const aiEnvironment = requireBackend('dotenv').parse(readFileSync(new URL('.env',aiDirectory)));
  assert.equal(aiEnvironment.AI_GENERATION_MODE ?? 'gemini','gemini','Live verification requires configured Gemini mode');
  assert.ok(aiEnvironment.AI_GEMINI_API_KEY,'Configured Gemini key is missing');
  const portProbe=createServer();portProbe.listen(0,'127.0.0.1');await once(portProbe,'listening');const aiPort=portProbe.address().port;await new Promise(r=>portProbe.close(r));
  const aiProcess=spawn(new URL('.venv/bin/python',aiDirectory).pathname,['-m','uvicorn','app.main:app','--host','127.0.0.1','--port',String(aiPort)],{cwd:aiDirectory,env:{...process.env,...aiEnvironment},stdio:['ignore','ignore','ignore']});
  const aiExit=once(aiProcess,'exit');
  t.after(async()=>{if(aiProcess.exitCode===null&&aiProcess.signalCode===null)aiProcess.kill('SIGTERM');await aiExit;});
  let ready=false;
  for(let attempt=0;attempt<80;attempt++){try{await fetch(`http://127.0.0.1:${aiPort}/api/v1/internal/health`);ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(ready,'Configured FastAPI process did not become reachable');
  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '3000', CORS_ORIGIN: new URL(dashboardUrl).origin,
    DATABASE_URL: scopedUrl.href,
    AI_SERVICE_URL: `http://127.0.0.1:${aiPort}`, AI_SERVICE_TIMEOUT_MS: '60000',
    AI_INTERNAL_AUTH_SECRET: aiEnvironment.AI_INTERNAL_AUTH_SECRET,
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

  const config={displayName:'F7 Context Assistant',systemInstructions:'You are a staff test assistant. Remember facts stated earlier in this conversation. Answer briefly.',welcomeMessage:'Hello',fallbackMessage:'Please try again.',modelSettings:{temperature:0.2,maxOutputTokens:128,maxContextMessages:10}};
  const assistantCreated=await owner.context.request.post(`${apiUrl}/api/v1/businesses/${businessIds[1]}/assistants`,{headers:{'X-CSRF-Token':owner.session.session.csrfToken},data:config});assert.equal(assistantCreated.status(),201);
  const assistant=await assistantCreated.json();
  const published=await owner.context.request.post(`${apiUrl}/api/v1/businesses/${businessIds[1]}/assistants/${assistant.assistant.id}/versions/${assistant.version.id}/publish`,{headers:{'X-CSRF-Token':owner.session.session.csrfToken},data:{}});assert.equal(published.status(),200);
  await owner.page.goto(`${dashboardUrl}/conversations`);
  await owner.page.locator('#playground-assistant').selectOption(assistant.assistant.id);
  await owner.page.getByRole('button',{name:'New conversation',exact:true}).click();
  await owner.page.getByLabel('Message to assistant').waitFor();
  const conversationId=new URL(owner.page.url()).searchParams.get('conversation');assert.ok(conversationId);
  const requests=[];owner.page.on('request',r=>{if(r.url().endsWith('/turns'))requests.push({headers:r.headers(),body:r.postDataJSON()});});
  await owner.page.getByLabel('Message to assistant').fill('My test code word is lavender. Acknowledge it briefly.');
  await owner.page.getByRole('button',{name:'Send message',exact:true}).click();
  await owner.page.locator('.conversation-bubble--assistant').waitFor({timeout:65000});
  assert.match(await owner.page.locator('.conversation-bubble--assistant').textContent(),/mode: gemini/);
  await owner.page.getByLabel('Message to assistant').fill('What test code word did I tell you?');
  await owner.page.getByRole('button',{name:'Send message',exact:true}).click();
  await owner.page.waitForFunction(()=>document.querySelectorAll('.conversation-bubble--assistant').length===2,{},{timeout:65000});
  assert.match(await owner.page.locator('.conversation-bubble--assistant').last().innerText(),/lavender/i);
  const replay=await owner.context.request.post(`${apiUrl}/api/v1/businesses/${businessIds[1]}/conversations/${conversationId}/turns`,{headers:{'X-CSRF-Token':owner.session.session.csrfToken,'Idempotency-Key':requests[1].headers['idempotency-key']},data:requests[1].body});
  assert.equal(replay.status(),200);assert.equal((await replay.json()).idempotentReplay,true);
  const stored=await postgresPool.query('SELECT role FROM conversation_messages WHERE conversation_id=$1 ORDER BY sequence_number',[conversationId]);assert.deepEqual(stored.rows.map(r=>r.role),['user','assistant','user','assistant']);
  await owner.page.reload();await owner.page.waitForFunction(()=>document.querySelectorAll('.conversation-bubble').length===4);
  await owner.page.screenshot({path:'/tmp/conversations-live.png',fullPage:true,animations:'disabled'});
  aiProcess.kill('SIGTERM');await aiExit;
  await owner.page.getByLabel('Message to assistant').fill('This message should remain unsent during an outage.');
  await owner.page.getByRole('button',{name:'Send message',exact:true}).click();
  await owner.page.getByText('Conversation request failed',{exact:true}).waitFor();
  assert.equal(await owner.page.getByLabel('Message to assistant').inputValue(),'This message should remain unsent during an outage.');
  assert.equal((await postgresPool.query('SELECT count(*)::int AS count FROM conversation_messages WHERE conversation_id=$1',[conversationId])).rows[0].count,4);
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
