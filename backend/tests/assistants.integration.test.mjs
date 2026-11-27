import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
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

test('live versioned assistant configuration, tool scopes, knowledge visibility, concurrency, and isolation', {
  skip: !databaseUrl,
  timeout: 45_000,
}, async (t) => {
  const schema = `onusai_asst_test_${randomUUID().replaceAll('-', '')}`;
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

  Object.assign(process.env, {
    PORT: '3000',
    NODE_ENV: 'test',
    CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: 'http://127.0.0.1:8001',
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
  });

  const postgresModule = await import('../dist/integrations/database/postgres.js');
  const { postgresPool } = postgresModule;
  closeDatabasePool = postgresModule.closeDatabasePool;
  const { runMigrations } = await import('../dist/integrations/database/migrations.js');
  const { hashPassword } = await import('../dist/utils/password.js');
  const { app } = await import('../dist/app.js');

  await runMigrations();

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const alphaOwnerPw = `Alpha-Owner-${randomUUID()}`;
  const alphaOpPw = `Alpha-Op-${randomUUID()}`;
  const betaOwnerPw = `Beta-Owner-${randomUUID()}`;

  const alphaBusinessId = (
    await postgresPool.query("INSERT INTO businesses (name) VALUES ('Alpha Clinic') RETURNING id")
  ).rows[0].id;
  const betaBusinessId = (
    await postgresPool.query("INSERT INTO businesses (name) VALUES ('Beta Dental') RETURNING id")
  ).rows[0].id;

  const alphaLoc1Id = (
    await postgresPool.query(
      "INSERT INTO business_locations (business_id, name, timezone) VALUES ($1, 'Alpha Main', 'UTC') RETURNING id",
      [alphaBusinessId],
    )
  ).rows[0].id;
  const alphaLoc2Id = (
    await postgresPool.query(
      "INSERT INTO business_locations (business_id, name, timezone) VALUES ($1, 'Alpha West', 'UTC') RETURNING id",
      [alphaBusinessId],
    )
  ).rows[0].id;
  const alphaArchivedLocId = (
    await postgresPool.query(
      "INSERT INTO business_locations (business_id, name, timezone, archived_at) VALUES ($1, 'Alpha Old', 'UTC', CURRENT_TIMESTAMP) RETURNING id",
      [alphaBusinessId],
    )
  ).rows[0].id;
  const betaLocId = (
    await postgresPool.query(
      "INSERT INTO business_locations (business_id, name, timezone) VALUES ($1, 'Beta Main', 'UTC') RETURNING id",
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
  await seedUser('alpha-op@example.test', 'Alpha Op', alphaOpPw, alphaBusinessId, 'operator');
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

  const validAssistantPayload = {
    displayName: 'Alpha Care Assistant',
    description: 'Answers clinic questions and checks appointment availability.',
    welcomeMessage: 'Welcome to Alpha Clinic! How can we help today?',
    systemInstructions: 'Be helpful, concise, and never fabricate availability.',
    language: 'en-US',
    tone: 'friendly',
    fallbackMessage: 'Please contact our reception team directly for help.',
    modelSettings: { temperature: 0.25, maxOutputTokens: 600, maxContextMessages: 8 },
    allowedTools: ['lookup_availability'],
    allowedKnowledgeScopes: ['public'],
    knowledgeLocationScope: 'business_wide',
  };

  let businessAssistantId;
  let v1Id;

  await t.test('creates business-level and location-level assistants with v1 draft, enforcing scope uniqueness and validation', async () => {
    // Public branding endpoint returns platform branding without any business/assistant instructions.
    const brandRes = await fetch(`${baseUrl}/api/v1/branding`);
    assert.equal(brandRes.status, 200);
    const brandBody = await brandRes.json();
    assert.equal(brandBody.productName, 'OnusAI');

    // Approved tool registry is readable by staff.
    const toolsRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/tools`, {
      headers: { cookie: alphaOperator.cookie },
    });
    assert.equal(toolsRes.status, 200);
    const toolsBody = await toolsRes.json();
    assert.ok(toolsBody.tools.every((tool) => tool.defaultAllowed === false));

    // Reject unapproved tool scope and foreign/archived location references.
    const badTool = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...validAssistantPayload, allowedTools: ['shell_exec'] }),
    });
    assert.equal(badTool.status, 400);
    assert.equal((await badTool.json()).error.code, 'UNAPPROVED_TOOL_SCOPE');

    const foreignKnowledgeLoc = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...validAssistantPayload,
        knowledgeLocationScope: 'selected_locations',
        knowledgeLocationIds: [betaLocId],
      }),
    });
    assert.equal(foreignKnowledgeLoc.status, 400);
    assert.equal((await foreignKnowledgeLoc.json()).error.code, 'INVALID_LOCATION_REFERENCE');

    const foreignAssistantLoc = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...validAssistantPayload, locationId: betaLocId }),
    });
    assert.equal(foreignAssistantLoc.status, 404);
    assert.equal((await foreignAssistantLoc.json()).error.code, 'LOCATION_NOT_FOUND');

    const archivedAssistantLoc = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...validAssistantPayload, locationId: alphaArchivedLocId }),
    });
    assert.equal(archivedAssistantLoc.status, 409);
    assert.equal((await archivedAssistantLoc.json()).error.code, 'LOCATION_ARCHIVED');

    // Create business-level assistant successfully.
    const createRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify(validAssistantPayload),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    businessAssistantId = created.assistant.id;
    v1Id = created.version.id;
    assert.equal(created.assistant.scope, 'business');
    assert.equal(created.version.versionNumber, 1);
    assert.equal(created.version.status, 'draft');
    assert.equal(created.version.publishedAt, null);

    // Duplicate business-level assistant is rejected with 409.
    const dupBiz = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify(validAssistantPayload),
    });
    assert.equal(dupBiz.status, 409);
    assert.equal((await dupBiz.json()).error.code, 'ASSISTANT_ALREADY_EXISTS');

    // Location-level assistant creation with assigned_location knowledge scope succeeds.
    const locCreate = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...validAssistantPayload,
        locationId: alphaLoc1Id,
        displayName: 'Alpha Main Desk',
        knowledgeLocationScope: 'assigned_location',
      }),
    });
    assert.equal(locCreate.status, 201);
    const locCreated = await locCreate.json();
    assert.equal(locCreated.assistant.scope, 'location');
    assert.equal(locCreated.version.knowledgeLocationScope, 'assigned_location');
  });

  await t.test('supports draft editing, concurrent-safe publishing, immutability, and version history', async () => {
    // Edit v1 draft with selected_locations knowledge visibility.
    const patchV1 = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}/versions/${v1Id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tone: 'professional',
          allowedTools: ['lookup_availability', 'request_human_handoff'],
          allowedKnowledgeScopes: ['public', 'staff_only'],
          knowledgeLocationScope: 'selected_locations',
          knowledgeLocationIds: [alphaLoc1Id, alphaLoc2Id],
        }),
      },
    );
    assert.equal(patchV1.status, 200);
    const patchedV1Body = await patchV1.json();
    assert.equal(patchedV1Body.version.tone, 'professional');
    assert.deepEqual(patchedV1Body.version.knowledgeLocationIds.sort(), [alphaLoc1Id, alphaLoc2Id].sort());

    // Concurrent publish race on v1: exactly one succeeds (200), the other returns 409 VERSION_NOT_DRAFT.
    const publishReq = () =>
      fetch(
        `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}/versions/${v1Id}/publish`,
        {
          method: 'POST',
          headers: {
            cookie: alphaOwner.cookie,
            'x-csrf-token': alphaOwner.csrf,
          },
        },
      );

    const [pubA, pubB] = await Promise.all([publishReq(), publishReq()]);
    const statuses = [pubA.status, pubB.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409]);

    const winnerBody = pubA.status === 200 ? await pubA.json() : await pubB.json();
    const loserBody = pubA.status === 409 ? await pubA.json() : await pubB.json();
    assert.equal(winnerBody.version.status, 'published');
    assert.ok(typeof winnerBody.version.publishedAt === 'string');
    assert.equal(loserBody.error.code, 'VERSION_NOT_DRAFT');

    // Published version is immutable via API and via direct PostgreSQL trigger.
    const editPublished = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}/versions/${v1Id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ displayName: 'Tampered' }),
      },
    );
    assert.equal(editPublished.status, 409);
    assert.equal((await editPublished.json()).error.code, 'VERSION_IMMUTABLE');

    await assert.rejects(
      postgresPool.query("UPDATE assistant_versions SET system_instructions = 'Tampered' WHERE id = $1", [v1Id]),
      (error) => error.code === '23514',
    );

    // Create draft v2 cloned from v1 with overrides; second concurrent draft creation fails 409.
    const createV2 = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}/versions`,
      {
        method: 'POST',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          displayName: 'Alpha Care Assistant v2',
          knowledgeLocationScope: 'business_wide',
        }),
      },
    );
    assert.equal(createV2.status, 201);
    const v2Body = await createV2.json();
    const v2Id = v2Body.version.id;
    assert.equal(v2Body.version.versionNumber, 2);
    assert.equal(v2Body.version.status, 'draft');
    assert.deepEqual(v2Body.version.knowledgeLocationIds, []);

    const dupDraft = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}/versions`,
      {
        method: 'POST',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(dupDraft.status, 409);
    assert.equal((await dupDraft.json()).error.code, 'DRAFT_ALREADY_EXISTS');

    // Publish v2 -> v1 becomes superseded, v2 becomes published.
    const pubV2 = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}/versions/${v2Id}/publish`,
      {
        method: 'POST',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
        },
      },
    );
    assert.equal(pubV2.status, 200);
    assert.equal((await pubV2.json()).version.status, 'published');

    // Verify full version history and detail.
    const historyRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}/versions`,
      { headers: { cookie: alphaOperator.cookie } },
    );
    assert.equal(historyRes.status, 200);
    const history = (await historyRes.json()).versions;
    assert.equal(history.length, 2);
    assert.equal(history[0].versionNumber, 2);
    assert.equal(history[0].status, 'published');
    assert.equal(history[1].versionNumber, 1);
    assert.equal(history[1].status, 'superseded');
  });

  await t.test('failed publish transaction rolls back cleanly when referenced location is archived', async () => {
    // Create draft v3 referencing alphaLoc2Id, then archive alphaLoc2Id before publishing.
    const draftV3Res = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}/versions`,
      {
        method: 'POST',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          knowledgeLocationScope: 'selected_locations',
          knowledgeLocationIds: [alphaLoc2Id],
        }),
      },
    );
    assert.equal(draftV3Res.status, 201);
    const v3Id = (await draftV3Res.json()).version.id;

    const archiveLoc2 = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations/${alphaLoc2Id}`,
      {
        method: 'DELETE',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
        },
      },
    );
    assert.equal(archiveLoc2.status, 200);

    const failPub = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}/versions/${v3Id}/publish`,
      {
        method: 'POST',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
        },
      },
    );
    assert.equal(failPub.status, 400);
    assert.equal((await failPub.json()).error.code, 'INVALID_LOCATION_REFERENCE');

    // Confirm v2 is still published and v3 is still draft (transaction rolled back).
    const detail = await (
      await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}`, {
        headers: { cookie: alphaOwner.cookie },
      })
    ).json();
    assert.equal(detail.publishedVersion.versionNumber, 2);
    assert.equal(detail.draftVersion.id, v3Id);
    assert.equal(detail.draftVersion.status, 'draft');
  });

  await t.test('enforces CSRF, owner/operator RBAC, and cross-tenant isolation in HTTP and SQL', async () => {
    // Missing CSRF on assistant mutation.
    const noCsrf = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants`, {
      method: 'POST',
      headers: { cookie: alphaOwner.cookie, 'content-type': 'application/json' },
      body: JSON.stringify(validAssistantPayload),
    });
    assert.equal(noCsrf.status, 403);
    assert.equal((await noCsrf.json()).error.code, 'CSRF_TOKEN_INVALID');

    // Operator can read assistant detail and version, but cannot mutate.
    const opGet = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}`,
      { headers: { cookie: alphaOperator.cookie } },
    );
    assert.equal(opGet.status, 200);

    const opPatch = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}/versions/${v1Id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ displayName: 'Op Edit' }),
      },
    );
    assert.equal(opPatch.status, 403);
    assert.equal((await opPatch.json()).error.code, 'INSUFFICIENT_PERMISSIONS');

    // Cross-tenant access to Alpha's assistant endpoints is denied with 403.
    const crossRead = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}`,
      { headers: { cookie: betaOwner.cookie } },
    );
    assert.equal(crossRead.status, 403);
    assert.equal((await crossRead.json()).error.code, 'TENANT_ACCESS_DENIED');

    // Beta owner querying Alpha's assistantId under Beta's tenant URL returns 404.
    const foreignAssistant = await fetch(
      `${baseUrl}/api/v1/businesses/${betaBusinessId}/assistants/${businessAssistantId}`,
      { headers: { cookie: betaOwner.cookie } },
    );
    assert.equal(foreignAssistant.status, 404);
    assert.equal((await foreignAssistant.json()).error.code, 'ASSISTANT_NOT_FOUND');

    // Database composite FK prevents cross-tenant knowledge location linking even in raw SQL.
    const detail = await (
      await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/assistants/${businessAssistantId}`, {
        headers: { cookie: alphaOwner.cookie },
      })
    ).json();
    await assert.rejects(
      postgresPool.query(
        'INSERT INTO assistant_version_knowledge_locations (business_id, assistant_version_id, location_id) VALUES ($1, $2, $3)',
        [alphaBusinessId, detail.draftVersion.id, betaLocId],
      ),
      (error) => error.code === '23503',
    );
  });
});

