// Optional browser regression suite. Uses an externally available Playwright Core
// and Chromium; adds no application or test dependencies to this project.
// PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright-core/index.mjs
// CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chrome
// node --test tests/browser/staff.browser.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5173';
let browser;

before(async () => {
  if (!process.env.PLAYWRIGHT_MODULE_PATH || !process.env.CHROMIUM_EXECUTABLE_PATH) {
    throw new Error('Set PLAYWRIGHT_MODULE_PATH and CHROMIUM_EXECUTABLE_PATH to existing browser tooling.');
  }
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, headless: true });
});
after(async () => { await browser?.close(); });

const memberships = [
  { membershipId: 'm-a', businessId: 'business-a', businessName: 'Northstar Dental', role: 'owner' },
  { membershipId: 'm-b', businessId: 'business-b', businessName: 'Beacon Studio', role: 'owner' },
  { membershipId: 'm-c', businessId: 'business-c', businessName: 'Operator Workspace', role: 'operator' },
];

function membersFor(businessId) {
  return [
    { membershipId: `${businessId}-owner`, userId: 'user-a', displayName: businessId === 'business-b' ? 'Jordan Beacon' : 'Avery Stone',
      email: `${businessId}-owner@example.test`, role: 'owner', createdAt: '2026-11-27T00:00:00.000Z' },
    { membershipId: `${businessId}-operator`, userId: 'user-b', displayName: 'Taylor Quinn',
      email: `${businessId}-operator@example.test`, role: 'operator', createdAt: '2026-11-27T00:00:00.000Z' },
  ];
}

async function fixture(t, { role = 'owner', memberHandler, ignoreMemberAbort = false, businesses = memberships } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No browser runtime errors'));
  const requests = [];
  const selectedBusinesses = role === 'operator' ? [memberships[2]] : businesses;
  await page.addInitScript(({ ignoreAbort }) => {
    window.__staffRequests = [];
    const nativeFetch = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).endsWith('/members')) {
        const record = { url: String(input), aborted: init.signal.aborted };
        window.__staffRequests.push(record);
        init.signal.addEventListener('abort', () => { record.aborted = true; });
        if (ignoreAbort) return nativeFetch(input, { ...init, signal: undefined });
      }
      return nativeFetch(input, init);
    };
  }, { ignoreAbort: ignoreMemberAbort });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/auth/me') return send({
      user: { id: 'user-a', displayName: 'Avery Stone', email: 'avery@example.test' },
      memberships: selectedBusinesses, session: { expiresAt: '2099-01-01T00:00:00Z', csrfToken: 'browser-test-csrf' },
    });
    if (path === '/businesses') return send({ businesses: selectedBusinesses });
    const match = path.match(/^\/businesses\/([^/]+)\/members$/);
    if (match) {
      requests.push({ businessId: match[1], method: route.request().method() });
      if (memberHandler) return memberHandler({ route, businessId: match[1], send, requests });
      return send({ businessId: match[1], members: membersFor(match[1]) });
    }
    const business = selectedBusinesses.find((entry) => path === `/businesses/${entry.businessId}`);
    if (business) return send({ business: { id: business.businessId, name: business.businessName, retentionDays: null }, membership: { id: business.membershipId, role: business.role } });
    // Branding falls back to the real centralized local config.
    if (path === '/branding') return send({ error: { code: 'UNAVAILABLE', message: 'Use local branding' } }, 503);
    return send({ status: 'ok' });
  });
  return { page, context, requests };
}

test('owner sees actual staff rows, separate columns, calculated summary and no mutation controls', async (t) => {
  const { page, requests } = await fixture(t);
  await page.goto(`${baseUrl}/staff`);
  await page.getByRole('rowheader', { name: 'Avery Stone You' }).waitFor();
  assert.equal(await page.getByRole('columnheader', { name: 'Email address' }).count(), 1);
  assert.deepEqual(await page.locator('.staff-page__metric-value').allTextContents(), ['2', '1', '1']);
  assert.equal(await page.locator('a[href="/staff"]').count(), 1);
  assert.ok(requests.every((request) => request.businessId === 'business-a' && request.method === 'GET'));
  assert.equal(await page.getByRole('button', { name: /invite|remove|change role/i }).count(), 0);
});

test('operator direct access is denied without any members request; sidebar and overview hide staff', async (t) => {
  const { page, requests } = await fixture(t, { role: 'operator' });
  await page.goto(`${baseUrl}/staff`);
  await page.getByRole('heading', { name: 'Staff directory access denied' }).waitFor();
  assert.equal(await page.locator('a[href="/staff"]').count(), 0);
  await page.getByRole('link', { name: 'Return to overview' }).click();
  await page.getByRole('heading', { name: 'Workspace Capabilities' }).waitFor();
  assert.equal(await page.locator('a[href="/staff"]').count(), 0);
  assert.equal(requests.length, 0);
});

test('switching owner workspaces clears old rows and counts immediately while the next request is pending', async (t) => {
  const deferred = Promise.withResolvers();
  const { page } = await fixture(t, { memberHandler: async ({ businessId, send }) => {
    if (businessId === 'business-b') await deferred.promise;
    return send({ businessId, members: membersFor(businessId) });
  } });
  t.after(() => deferred.resolve());
  await page.goto(`${baseUrl}/staff`);
  await page.getByText('business-a-owner@example.test', { exact: true }).waitFor();
  await page.locator('#workspace-switcher-select').selectOption('business-b');
  await page.getByRole('status', { name: 'Loading staff directory' }).waitFor();
  assert.equal(await page.getByText('business-a-owner@example.test', { exact: true }).count(), 0);
  assert.deepEqual(await page.locator('.staff-page__metric-value').allTextContents(), ['—', '—', '—']);
  deferred.resolve();
  await page.getByText('business-b-owner@example.test', { exact: true }).waitFor();
  assert.equal(await page.getByText('business-a-owner@example.test', { exact: true }).count(), 0);
});

test('switching during a request aborts the old signal and ignores its late response', async (t) => {
  const deferred = Promise.withResolvers();
  const { page } = await fixture(t, { ignoreMemberAbort: true, memberHandler: async ({ businessId, send }) => {
    if (businessId === 'business-a') await deferred.promise;
    return send({ businessId, members: membersFor(businessId) });
  } });
  t.after(() => deferred.resolve());
  await page.goto(`${baseUrl}/staff`);
  await page.waitForFunction(() => window.__staffRequests.length > 0);
  await page.locator('#workspace-switcher-select').selectOption('business-b');
  await page.getByText('business-b-owner@example.test', { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => window.__staffRequests.filter((request) => request.url.includes('business-a')).every((request) => request.aborted)));
  const oldResponse = page.waitForResponse((response) => response.url().endsWith('/business-a/members'));
  deferred.resolve();
  await oldResponse;
  // Let the fulfilled fetch and React updates finish before asserting isolation.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByText('business-a-owner@example.test', { exact: true }).count(), 0);
  assert.equal(await page.getByText('business-b-owner@example.test', { exact: true }).count(), 1);
});

test('switching from an owner to an operator business removes the directory and never fetches operator members', async (t) => {
  const { page, requests } = await fixture(t);
  await page.goto(`${baseUrl}/staff`);
  await page.getByText('business-a-owner@example.test', { exact: true }).waitFor();
  await page.locator('#workspace-switcher-select').selectOption('business-c');
  await page.getByRole('heading', { name: 'Staff directory access denied' }).waitFor();
  assert.equal(await page.locator('.staff-table').count(), 0);
  assert.equal(await page.locator('a[href="/staff"]').count(), 0);
  assert.ok(requests.every((request) => request.businessId !== 'business-c'));
});

test('leaving the staff route cancels its in-flight request', async (t) => {
  const deferred = Promise.withResolvers();
  const { page } = await fixture(t, { ignoreMemberAbort: true, memberHandler: async ({ businessId, send }) => {
    await deferred.promise;
    return send({ businessId, members: membersFor(businessId) });
  } });
  t.after(() => deferred.resolve());
  await page.goto(`${baseUrl}/staff`);
  await page.waitForFunction(() => window.__staffRequests.length > 0);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Workspace Capabilities' }).waitFor();
  assert.ok(await page.evaluate(() => window.__staffRequests.every((request) => request.aborted)));
  deferred.resolve();
  assert.equal(await page.locator('.staff-table').count(), 0);
});

test('empty directory shows zero counts and a dedicated empty state', async (t) => {
  const { page } = await fixture(t, { memberHandler: ({ businessId, send }) => send({ businessId, members: [] }) });
  await page.goto(`${baseUrl}/staff`);
  await page.getByRole('heading', { name: 'No staff members found' }).waitFor();
  assert.deepEqual(await page.locator('.staff-page__metric-value').allTextContents(), ['0', '0', '0']);
});

test('API failure shows error rather than empty state and Retry loads the directory', async (t) => {
  let fail = true;
  const { page } = await fixture(t, { memberHandler: ({ businessId, send }) => fail
    ? send({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' } }, 503)
    : send({ businessId, members: membersFor(businessId) }) });
  await page.goto(`${baseUrl}/staff`);
  await page.getByRole('alert').filter({ hasText: 'Unable to load staff' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'No staff members found' }).count(), 0);
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByText('business-a-owner@example.test', { exact: true }).waitFor();
});

test('server 403 after a loaded directory clears rows and shows access denied', async (t) => {
  let forbidden = false;
  const { page } = await fixture(t, { memberHandler: ({ businessId, send }) => forbidden
    ? send({ error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Permission denied.' } }, 403)
    : send({ businessId, members: membersFor(businessId) }) });
  await page.goto(`${baseUrl}/staff`);
  await page.getByText('business-a-owner@example.test', { exact: true }).waitFor();
  forbidden = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('heading', { name: 'Staff directory access denied' }).waitFor();
  assert.equal(await page.locator('.staff-table').count(), 0);
});

test('staff 401 redirects to login through the existing session handler', async (t) => {
  const { page } = await fixture(t, { memberHandler: ({ send }) => send({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Session expired.' } }, 401) });
  await page.goto(`${baseUrl}/staff`);
  await page.waitForURL('**/login');
  assert.equal(await page.locator('.staff-table').count(), 0);
});

test('mismatched tenant response never renders foreign staff', async (t) => {
  const { page } = await fixture(t, { memberHandler: ({ send }) => send({ businessId: 'business-b', members: membersFor('business-b') }) });
  await page.goto(`${baseUrl}/staff`);
  await page.getByRole('alert').filter({ hasText: 'could not be verified' }).waitFor();
  assert.equal(await page.getByText('business-b-owner@example.test', { exact: true }).count(), 0);
});

test('no workspace prompts selection without any members request', async (t) => {
  const { page, requests } = await fixture(t, { businesses: [] });
  await page.goto(`${baseUrl}/staff`);
  await page.getByRole('heading', { name: 'Select a business workspace' }).waitFor();
  assert.equal(requests.length, 0);
});

test('desktop, tablet and mobile remain within the viewport and support light, dark and system themes', async (t) => {
  const { page } = await fixture(t);
  await page.goto(`${baseUrl}/staff`);
  await page.getByText('business-a-owner@example.test', { exact: true }).waitFor();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    const dimensions = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= dimensions.width, `No page overflow at ${width}px`);
    assert.equal(await page.getByRole('table').count(), 2);
  }
  for (const theme of ['light', 'dark', 'system']) {
    await page.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click();
    if (theme === 'system') await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme === 'light' ? 'light' : 'dark');
  }
  // Optional local QA artifact destination, never a committed screenshot.
  if (process.env.STAFF_SCREENSHOT_DIRECTORY) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: `${process.env.STAFF_SCREENSHOT_DIRECTORY}/staff-dark.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Use light theme', exact: true }).click();
    await page.screenshot({ path: `${process.env.STAFF_SCREENSHOT_DIRECTORY}/staff-light.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${process.env.STAFF_SCREENSHOT_DIRECTORY}/staff-mobile.png`, fullPage: true, animations: 'disabled' });
  }
});
