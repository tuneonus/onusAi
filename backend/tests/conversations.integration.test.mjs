import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { Pool } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

function extractCookies(response) {
  const cookies = {};
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    const separator = pair.indexOf('=');
    if (separator > 0) {
      cookies[pair.slice(0, separator)] = pair.slice(separator + 1);
    }
  }
  return cookies;
}

test('live conversation & message persistence, ordering, pagination, idempotency, retention, and deletion', {
  skip: !databaseUrl,
  timeout: 45_000,
}, async (t) => {
  const schema = `onusai_conv_test_${randomUUID().replaceAll('-', '')}`;
  const observer = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    query_timeout: 5000,
    statement_timeout: 5000,
  });
  let closeDatabasePool;
  let schemaCreated = false;

  t.after(async () => {
    try {
      if (closeDatabasePool) {
        await closeDatabasePool();
      }
      if (schemaCreated) {
        await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } finally {
      await observer.end();
    }
  });

  await observer.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;

  const scopedUrl = new URL(databaseUrl);
  const originalOptions = scopedUrl.searchParams.get('options') ?? '';
  scopedUrl.searchParams.set('options', `${originalOptions} -c search_path=${schema},pg_catalog`.trim());

  const aiRequests = [];
  let aiReplyBehavior = { mode: 'ok' };
  const aiFixtureServer = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const parsed = raw ? JSON.parse(raw) : null;
      aiRequests.push({ path: req.url, requestId: req.headers['x-request-id'], body: parsed });

      if (aiReplyBehavior.mode === 'fail-503') {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ detail: 'AI unavailable' }));
        return;
      }
      if (aiReplyBehavior.mode === 'rate-limit') {
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ detail: 'Rate limited' }));
        return;
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          contractVersion: '1.0',
          requestId: parsed.requestId,
          mode: 'gemini',
          model: 'gemini-2.5-flash-lite',
          promptVersion: 'respond-v1',
          grounded: false,
          status: 'completed',
          answer: `Reply from ${parsed.assistant.displayName} (v:${parsed.scope.assistantVersionId}) to: ${parsed.conversation.userMessage}`,
          citations: [],
          toolProposals: [],
          usage: { inputTokens: 21, outputTokens: 9, totalTokens: 30, latencyMs: 12 },
        }),
      );
    });
  }).listen(0, '127.0.0.1');
  await once(aiFixtureServer, 'listening');
  t.after(
    () =>
      new Promise((resolve) =>
        aiFixtureServer.listening ? aiFixtureServer.close(() => resolve()) : resolve(),
      ),
  );
  const aiFixtureUrl = `http://127.0.0.1:${aiFixtureServer.address().port}`;

  Object.assign(process.env, {
    PORT: '3000',
    NODE_ENV: 'test',
    CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: aiFixtureUrl,
    AI_SERVICE_TIMEOUT_MS: '5000',
    AI_INTERNAL_AUTH_SECRET: 'test-internal-auth-secret-at-least-32-characters',
    DATABASE_URL: scopedUrl.href,
    DATABASE_CONNECTION_TIMEOUT_MS: '2000',
    DATABASE_IDLE_TIMEOUT_MS: '1000',
    DATABASE_QUERY_TIMEOUT_MS: '5000',
    AUTH_SESSION_TTL_MS: '60000',
    AUTH_LOGIN_MAX_ATTEMPTS: '5',
    AUTH_LOGIN_WINDOW_MS: '60000',
    AUTH_LOGIN_LOCKOUT_MS: '60000',
    CONVERSATION_RETENTION_DAYS: '90',
  });

  const postgresModule = await import('../dist/integrations/database/postgres.js');
  const { postgresPool } = postgresModule;
  closeDatabasePool = postgresModule.closeDatabasePool;
  const { runMigrations } = await import('../dist/integrations/database/migrations.js');
  const { hashPassword } = await import('../dist/utils/password.js');
  const { app } = await import('../dist/app.js');

  await runMigrations();

  let server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => (server.listening ? server.close(() => resolve()) : resolve())));
  let baseUrl = `http://127.0.0.1:${server.address().port}`;

  const alphaOwnerPw = `Alpha-Owner-${randomUUID()}`;
  const alphaOpPw = `Alpha-Op-${randomUUID()}`;
  const betaOwnerPw = `Beta-Owner-${randomUUID()}`;

  const alphaBusinessId = (
    await postgresPool.query(
      "INSERT INTO businesses (name, retention_days) VALUES ('Alpha Spa', 30) RETURNING id",
    )
  ).rows[0].id;
  const betaBusinessId = (
    await postgresPool.query("INSERT INTO businesses (name) VALUES ('Beta Gym') RETURNING id")
  ).rows[0].id;

  const alphaLocId = (
    await postgresPool.query(
      "INSERT INTO business_locations (business_id, name, timezone) VALUES ($1, 'Alpha Flagship', 'UTC') RETURNING id",
      [alphaBusinessId],
    )
  ).rows[0].id;
  const alphaArchivedLocId = (
    await postgresPool.query(
      "INSERT INTO business_locations (business_id, name, timezone, archived_at) VALUES ($1, 'Alpha Closed', 'UTC', CURRENT_TIMESTAMP) RETURNING id",
      [alphaBusinessId],
    )
  ).rows[0].id;
  const betaLocId = (
    await postgresPool.query(
      "INSERT INTO business_locations (business_id, name, timezone) VALUES ($1, 'Beta HQ', 'UTC') RETURNING id",
      [betaBusinessId],
    )
  ).rows[0].id;

  async function seedUser(email, displayName, password, businessId, role) {
    const userId = (
      await postgresPool.query(
        'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
        [email, displayName],
      )
    ).rows[0].id;
    await postgresPool.query(
      'INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)',
      [userId, await hashPassword(password)],
    );
    await postgresPool.query(
      'INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, $3)',
      [businessId, userId, role],
    );
    return userId;
  }

  await seedUser('alpha-owner@example.test', 'Alpha Owner', alphaOwnerPw, alphaBusinessId, 'owner');
  await seedUser('alpha-op@example.test', 'Alpha Operator', alphaOpPw, alphaBusinessId, 'operator');
  await seedUser('beta-owner@example.test', 'Beta Owner', betaOwnerPw, betaBusinessId, 'owner');

  async function loginAs(email, password) {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(res.status, 200);
    const cookies = extractCookies(res);
    const body = await res.json();
    return {
      cookie: `onusai_session=${cookies.onusai_session}; onusai_csrf=${cookies.onusai_csrf}`,
      csrf: body.session.csrfToken,
    };
  }

  const alphaOwner = await loginAs('alpha-owner@example.test', alphaOwnerPw);
  const alphaOperator = await loginAs('alpha-op@example.test', alphaOpPw);
  const betaOwner = await loginAs('beta-owner@example.test', betaOwnerPw);

  // Create an unpublished assistant and a published assistant (with v1 published, then v2 published).
  const assistantBody = {
    displayName: 'Alpha Helper',
    welcomeMessage: 'Hello!',
    systemInstructions: 'Keep answers grounded.',
    fallbackMessage: 'Please call reception.',
  };

  const draftOnlyRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants`, {
    method: 'POST',
    headers: {
      cookie: alphaOwner.cookie,
      'x-csrf-token': alphaOwner.csrf,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...assistantBody, locationId: alphaLocId }),
  });
  const draftOnlyAssistantId = (await draftOnlyRes.json()).assistant.id;

  const mainAsstRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants`, {
    method: 'POST',
    headers: {
      cookie: alphaOwner.cookie,
      'x-csrf-token': alphaOwner.csrf,
      'content-type': 'application/json',
    },
    body: JSON.stringify(assistantBody),
  });
  const mainAsstBody = await mainAsstRes.json();
  const mainAssistantId = mainAsstBody.assistant.id;
  const v1Id = mainAsstBody.version.id;

  const pubV1 = await fetch(
    `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${mainAssistantId}/versions/${v1Id}/publish`,
    {
      method: 'POST',
      headers: { cookie: alphaOwner.cookie, 'x-csrf-token': alphaOwner.csrf },
    },
  );
  assert.equal(pubV1.status, 200);

  let conv1Id;
  let conv2Id;

  await t.test('creates playground conversations bound to published assistant versions and retention policy', async () => {
    // Rejects draft-only assistant.
    const unpubRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations`, {
      method: 'POST',
      headers: {
        cookie: alphaOperator.cookie,
        'x-csrf-token': alphaOperator.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ assistantId: draftOnlyAssistantId }),
    });
    assert.equal(unpubRes.status, 409);
    assert.equal((await unpubRes.json()).error.code, 'ASSISTANT_NOT_PUBLISHED');

    // Rejects archived location and visitor channel spoofing.
    const archivedLocRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations`, {
      method: 'POST',
      headers: {
        cookie: alphaOperator.cookie,
        'x-csrf-token': alphaOperator.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ assistantId: mainAssistantId, locationId: alphaArchivedLocId }),
    });
    assert.equal(archivedLocRes.status, 409);
    assert.equal((await archivedLocRes.json()).error.code, 'LOCATION_ARCHIVED');

    const visitorSpoof = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations`, {
      method: 'POST',
      headers: {
        cookie: alphaOperator.cookie,
        'x-csrf-token': alphaOperator.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ assistantId: mainAssistantId, channel: 'visitor' }),
    });
    assert.equal(visitorSpoof.status, 403);
    assert.equal((await visitorSpoof.json()).error.code, 'FORBIDDEN_CONVERSATION_CHANNEL');

    // Operator creates playground conversation with idempotency key; replay returns 200 without duplicate.
    const createConv = () =>
      fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations`, {
        method: 'POST',
        headers: {
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
          'idempotency-key': 'conv-init-1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ assistantId: mainAssistantId, locationId: alphaLocId }),
      });

    const first = await createConv();
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    conv1Id = firstBody.conversation.id;
    assert.equal(firstBody.idempotentReplay, false);
    assert.equal(firstBody.conversation.assistantVersionId, v1Id);
    assert.equal(firstBody.conversation.channel, 'playground');
    assert.equal(firstBody.conversation.status, 'active');

    // Verify 30-day per-business retention window was applied (~30 days ahead of createdAt).
    const retentionDaysDiff =
      (Date.parse(firstBody.conversation.retainUntil) - Date.parse(firstBody.conversation.createdAt)) /
      86_400_000;
    assert.ok(retentionDaysDiff > 29.9 && retentionDaysDiff < 30.1);

    const replay = await createConv();
    assert.equal(replay.status, 200);
    const replayBody = await replay.json();
    assert.equal(replayBody.idempotentReplay, true);
    assert.equal(replayBody.conversation.id, conv1Id);

    // Publish v2 of mainAssistantId; existing conv1 must still point to historical v1Id!
    const v2DraftRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${mainAssistantId}/versions`,
      {
        method: 'POST',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ displayName: 'Alpha Helper v2' }),
      },
    );
    const v2Id = (await v2DraftRes.json()).version.id;
    await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${mainAssistantId}/versions/${v2Id}/publish`,
      {
        method: 'POST',
        headers: { cookie: alphaOwner.cookie, 'x-csrf-token': alphaOwner.csrf },
      },
    );

    // New conversation binds to v2Id, while conv1 preserves v1Id.
    const conv2Res = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ assistantId: mainAssistantId }),
    });
    assert.equal(conv2Res.status, 201);
    const conv2Body = await conv2Res.json();
    conv2Id = conv2Body.conversation.id;
    assert.equal(conv2Body.conversation.assistantVersionId, v2Id);

    const conv1Check = await (
      await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}`, {
        headers: { cookie: alphaOperator.cookie },
      })
    ).json();
    assert.equal(conv1Check.conversation.assistantVersionId, v1Id);
  });

  await t.test('persists ordered messages, rejects role impersonation, enforces idempotency, and paginates', async () => {
    // Clients cannot spoof assistant or system messages.
    for (const role of ['assistant', 'system']) {
      const spoof = await fetch(
        `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}/messages`,
        {
          method: 'POST',
          headers: {
            cookie: alphaOwner.cookie,
            'x-csrf-token': alphaOwner.csrf,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ role, content: 'Spoofed' }),
        },
      );
      assert.equal(spoof.status, 403);
      assert.equal((await spoof.json()).error.code, 'FORBIDDEN_MESSAGE_ROLE');
    }

    // Post 3 messages with deterministic ordering; retry message 1 idempotently.
    const postMsg = (payload, key) =>
      fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}/messages`, {
        method: 'POST',
        headers: {
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
          ...(key ? { 'idempotency-key': key } : {}),
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

    const m1 = await postMsg({ role: 'user', content: 'First question', metadata: { turn: 1 } }, 'm-key-1');
    assert.equal(m1.status, 201);
    const m1Body = await m1.json();
    assert.equal(m1Body.message.sequenceNumber, 1);

    const m1Replay = await postMsg({ role: 'user', content: 'First question' }, 'm-key-1');
    assert.equal(m1Replay.status, 200);
    const m1ReplayBody = await m1Replay.json();
    assert.equal(m1ReplayBody.idempotentReplay, true);
    assert.equal(m1ReplayBody.message.id, m1Body.message.id);

    const m1Conflict = await postMsg({ role: 'user', content: 'Different text' }, 'm-key-1');
    assert.equal(m1Conflict.status, 409);
    assert.equal((await m1Conflict.json()).error.code, 'IDEMPOTENCY_KEY_CONFLICT');

    const m2 = await postMsg({ role: 'operator', content: 'Operator reply' }, 'm-key-2');
    assert.equal(m2.status, 201);
    assert.equal((await m2.json()).message.sequenceNumber, 2);

    const m3 = await postMsg({ role: 'user', content: 'Follow-up question' }, 'm-key-3');
    assert.equal(m3.status, 201);
    assert.equal((await m3.json()).message.sequenceNumber, 3);

    // Update status (handoff/close).
    const statusRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'human_active' }),
      },
    );
    assert.equal(statusRes.status, 200);
    assert.equal((await statusRes.json()).conversation.status, 'human_active');

    // Paginate messages: limit=2&offset=0, then afterSequence=2.
    const page1 = await (
      await fetch(
        `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}/messages?limit=2&offset=0`,
        { headers: { cookie: alphaOperator.cookie } },
      )
    ).json();
    assert.deepEqual(
      page1.messages.map((m) => m.sequenceNumber),
      [1, 2],
    );
    assert.deepEqual(page1.pagination, { limit: 2, offset: 0, total: 3, hasMore: true });

    const incremental = await (
      await fetch(
        `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}/messages?afterSequence=2`,
        { headers: { cookie: alphaOperator.cookie } },
      )
    ).json();
    assert.deepEqual(
      incremental.messages.map((m) => m.sequenceNumber),
      [3],
    );

    // Paginate conversations (2 active conversations in Alpha).
    const convPage1 = await (
      await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations?limit=1&offset=0`, {
        headers: { cookie: alphaOperator.cookie },
      })
    ).json();
    assert.equal(convPage1.conversations.length, 1);
    assert.equal(convPage1.conversations[0].id, conv1Id);
    assert.equal(convPage1.conversations[0].messageCount, 3);
    assert.deepEqual(convPage1.pagination, { limit: 1, offset: 0, total: 2, hasMore: true });

    // Restart persistence check: close and recreate HTTP server, verify records survive.
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const afterRestart = await (
      await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}/messages`, {
        headers: { cookie: alphaOperator.cookie },
      })
    ).json();
    assert.equal(afterRestart.messages.length, 3);
  });

  await t.test('enforces CSRF, cross-tenant isolation, soft-delete hiding, and owner-only purge', async () => {
    // Missing CSRF on conversation creation.
    const noCsrf = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations`, {
      method: 'POST',
      headers: { cookie: alphaOperator.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ assistantId: mainAssistantId }),
    });
    assert.equal(noCsrf.status, 403);
    assert.equal((await noCsrf.json()).error.code, 'CSRF_TOKEN_INVALID');

    // Cross-tenant access rejected (403 on foreign business, 404 on foreign conversationId).
    const crossList = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations`, {
      headers: { cookie: betaOwner.cookie },
    });
    assert.equal(crossList.status, 403);
    assert.equal((await crossList.json()).error.code, 'TENANT_ACCESS_DENIED');

    const foreignConv = await fetch(
      `${baseUrl}/api/v1/businesses/${betaBusinessId}/conversations/${conv1Id}`,
      { headers: { cookie: betaOwner.cookie } },
    );
    assert.equal(foreignConv.status, 404);
    assert.equal((await foreignConv.json()).error.code, 'CONVERSATION_NOT_FOUND');

    // Database composite FK prevents cross-tenant conversation/location/assistant links.
    await assert.rejects(
      postgresPool.query(
        `INSERT INTO conversations (business_id, location_id, assistant_id, assistant_version_id, channel, retain_until)
         VALUES ($1, $2, $3, $4, 'playground', CURRENT_TIMESTAMP + interval '1 day')`,
        [alphaBusinessId, betaLocId, mainAssistantId, v1Id],
      ),
      (error) => error.code === '23503',
    );

    // Operator cannot delete or purge conversations (owner-only to protect customer data).
    const opDelete = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}`,
      {
        method: 'DELETE',
        headers: { cookie: alphaOperator.cookie, 'x-csrf-token': alphaOperator.csrf },
      },
    );
    assert.equal(opDelete.status, 403);
    assert.equal((await opDelete.json()).error.code, 'INSUFFICIENT_PERMISSIONS');

    const opPurge = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}/purge`,
      {
        method: 'POST',
        headers: { cookie: alphaOperator.cookie, 'x-csrf-token': alphaOperator.csrf },
      },
    );
    assert.equal(opPurge.status, 403);
    assert.equal((await opPurge.json()).error.code, 'INSUFFICIENT_PERMISSIONS');

    // Owner soft-deletes conv1: immediately excluded from all normal APIs.
    const ownerDelete = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}`,
      {
        method: 'DELETE',
        headers: { cookie: alphaOwner.cookie, 'x-csrf-token': alphaOwner.csrf },
      },
    );
    assert.equal(ownerDelete.status, 200);

    for (const [method, path, body] of [
      ['GET', `/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}`, undefined],
      ['PATCH', `/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}`, { status: 'closed' }],
      ['GET', `/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}/messages`, undefined],
      [
        'POST',
        `/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}/messages`,
        { role: 'user', content: 'After delete' },
      ],
      ['DELETE', `/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}`, undefined],
    ]) {
      const hidden = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(hidden.status, 404);
      assert.equal((await hidden.json()).error.code, 'CONVERSATION_NOT_FOUND');
    }

    const listAfterDelete = await (
      await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations`, {
        headers: { cookie: alphaOwner.cookie },
      })
    ).json();
    assert.deepEqual(
      listAfterDelete.conversations.map((c) => c.id),
      [conv2Id],
    );

    // Owner hard-purges conv1: permanently removes conversation & cascaded messages from PostgreSQL.
    const purgeRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${conv1Id}/purge`,
      {
        method: 'POST',
        headers: { cookie: alphaOwner.cookie, 'x-csrf-token': alphaOwner.csrf },
      },
    );
    assert.equal(purgeRes.status, 200);

    const remainingRows = await postgresPool.query(
      'SELECT count(*)::integer AS count FROM conversations WHERE id = $1',
      [conv1Id],
    );
    assert.equal(remainingRows.rows[0].count, 0);
    const remainingMsgs = await postgresPool.query(
      'SELECT count(*)::integer AS count FROM conversation_messages WHERE conversation_id = $1',
      [conv1Id],
    );
    assert.equal(remainingMsgs.rows[0].count, 0);
  });

  await t.test('AI turn orchestration persists turns, enforces idempotency, version consistency, status gating, and isolation', async () => {
    // Create a fresh playground conversation bound to the current published assistant version (v1).
    const convCreate = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
      },
      body: JSON.stringify({ assistantId: mainAssistantId }),
    });
    assert.equal(convCreate.status, 201);
    const turnConv = (await convCreate.json()).conversation;

    // Publish a v2 assistant version AFTER creating turnConv; turnConv must remain bound to v1!
    const v2DraftRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${mainAssistantId}/versions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
        },
        body: JSON.stringify({
          displayName: 'Alpha Concierge V2',
          systemInstructions: 'V2 instructions that must not retroactively alter v1 conversations.',
        }),
      },
    );
    assert.equal(v2DraftRes.status, 201);
    const v2Id = (await v2DraftRes.json()).version.id;
    const v2PubRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${mainAssistantId}/versions/${v2Id}/publish`,
      {
        method: 'POST',
        headers: { cookie: alphaOwner.cookie, 'x-csrf-token': alphaOwner.csrf },
      },
    );
    assert.equal(v2PubRes.status, 200);

    // Operator executes Turn 1 with Idempotency-Key.
    aiRequests.length = 0;
    const turn1Res = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${turnConv.id}/turns`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
          'idempotency-key': 'turn-idem-1',
          'x-request-id': 'req-pg-turn-0001',
        },
        body: JSON.stringify({ content: 'What are your Friday hours?' }),
      },
    );
    assert.equal(turn1Res.status, 201);
    const turn1Body = await turn1Res.json();
    assert.equal(turn1Body.idempotentReplay, false);
    assert.equal(turn1Body.assistantVersionId, turnConv.assistantVersionId);
    assert.notEqual(turn1Body.assistantVersionId, v2Id);
    assert.equal(turn1Body.userMessage.role, 'user');
    assert.equal(turn1Body.userMessage.sequenceNumber, 1);
    assert.equal(turn1Body.assistantMessage.role, 'assistant');
    assert.equal(turn1Body.assistantMessage.sequenceNumber, 2);
    assert.equal(turn1Body.assistantMessage.authorUserId, null);
    assert.equal(turn1Body.ai.mode, 'gemini');
    assert.equal(turn1Body.ai.model, 'gemini-2.5-flash-lite');
    assert.equal(turn1Body.ai.promptVersion, 'respond-v1');
    assert.equal(turn1Body.ai.grounded, false);
    assert.deepEqual(turn1Body.ai.usage, {
      inputTokens: 21,
      outputTokens: 9,
      totalTokens: 30,
      latencyMs: 12,
    });
    assert.equal(aiRequests.length, 1);
    assert.equal(aiRequests[0].requestId, 'req-pg-turn-0001');
    assert.equal(aiRequests[0].body.scope.assistantVersionId, turnConv.assistantVersionId);
    assert.notEqual(aiRequests[0].body.assistant.displayName, 'Alpha Concierge V2');
    assert.deepEqual(aiRequests[0].body.conversation.messages, []);

    // Retrying Turn 1 with the same Idempotency-Key returns 200 replay with zero extra AI calls or DB rows.
    const replayRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${turnConv.id}/turns`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
          'idempotency-key': 'turn-idem-1',
        },
        body: JSON.stringify({ content: 'What are your Friday hours?' }),
      },
    );
    assert.equal(replayRes.status, 200);
    const replayBody = await replayRes.json();
    assert.equal(replayBody.idempotentReplay, true);
    assert.equal(replayBody.userMessage.id, turn1Body.userMessage.id);
    assert.equal(replayBody.assistantMessage.id, turn1Body.assistantMessage.id);
    assert.equal(aiRequests.length, 1);

    // Reusing the same Idempotency-Key with different content fails with 409.
    const conflictRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${turnConv.id}/turns`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
          'idempotency-key': 'turn-idem-1',
        },
        body: JSON.stringify({ content: 'Different prompt' }),
      },
    );
    assert.equal(conflictRes.status, 409);
    assert.equal((await conflictRes.json()).error.code, 'IDEMPOTENCY_KEY_CONFLICT');

    // Turn 2 receives Turn 1's user + assistant messages in chronological context.
    const turn2Res = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${turnConv.id}/turns`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
        },
        body: JSON.stringify({ content: 'Do you have weekend slots?' }),
      },
    );
    assert.equal(turn2Res.status, 201);
    const turn2Body = await turn2Res.json();
    assert.equal(turn2Body.userMessage.sequenceNumber, 3);
    assert.equal(turn2Body.assistantMessage.sequenceNumber, 4);
    assert.equal(aiRequests.length, 2);
    assert.deepEqual(
      aiRequests[1].body.conversation.messages.map((m) => ({
        role: m.role,
        sequenceNumber: m.sequenceNumber,
      })),
      [
        { role: 'user', sequenceNumber: 1 },
        { role: 'assistant', sequenceNumber: 2 },
      ],
    );

    // AI rate limit / failure leaves no orphan user message in PostgreSQL.
    aiReplyBehavior = { mode: 'rate-limit' };
    const failedTurnRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${turnConv.id}/turns`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
        },
        body: JSON.stringify({ content: 'Should not persist on 429' }),
      },
    );
    assert.equal(failedTurnRes.status, 429);
    assert.equal((await failedTurnRes.json()).error.code, 'AI_RATE_LIMITED');
    aiReplyBehavior = { mode: 'ok' };

    const afterFailMsgs = await (
      await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${turnConv.id}/messages`, {
        headers: { cookie: alphaOwner.cookie },
      })
    ).json();
    assert.equal(afterFailMsgs.messages.length, 4);

    // Role spoofing on /turns and cross-tenant access are rejected.
    const spoofTurn = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${turnConv.id}/turns`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
        },
        body: JSON.stringify({ role: 'assistant', content: 'Spoofed' }),
      },
    );
    assert.equal(spoofTurn.status, 403);
    assert.equal((await spoofTurn.json()).error.code, 'FORBIDDEN_MESSAGE_ROLE');

    const crossTenantTurn = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${turnConv.id}/turns`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: betaOwner.cookie,
          'x-csrf-token': betaOwner.csrf,
        },
        body: JSON.stringify({ content: 'Cross-tenant attempt' }),
      },
    );
    assert.equal(crossTenantTurn.status, 403);
    assert.equal((await crossTenantTurn.json()).error.code, 'TENANT_ACCESS_DENIED');

    // Moving conversation to pending_human pauses AI replies (409 CONVERSATION_NOT_ACTIVE).
    const handoffPatch = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${turnConv.id}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
        },
        body: JSON.stringify({ status: 'pending_human' }),
      },
    );
    assert.equal(handoffPatch.status, 200);

    const pausedTurn = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/conversations/${turnConv.id}/turns`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
        },
        body: JSON.stringify({ content: 'Should not trigger AI while pending_human' }),
      },
    );
    assert.equal(pausedTurn.status, 409);
    assert.equal((await pausedTurn.json()).error.code, 'CONVERSATION_NOT_ACTIVE');
    assert.equal(aiRequests.length, 3);
  });
});

