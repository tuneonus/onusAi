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
    if (path.endsWith('/assistants/tools')) return send({tools:[]});
    if (path.endsWith('/locations')) return send({businessId:path.split('/')[2],locations:[]});
    if (path.endsWith('/assistants')) return send({businessId:path.split('/')[2],assistants:[]});
    const match = path.match(/^\/businesses\/([^/]+)\/members$/);
    if (match) {
      requests.push({ businessId: match[1], method: route.request().method() });
      if (memberHandler) return memberHandler({ route, businessId: match[1], send, requests });
      return send({ businessId: match[1], members: membersFor(match[1]) });
    }
    const business = selectedBusinesses.find((entry) => path === `/businesses/${entry.businessId}`);
    if (business) return send({ business: { id: business.businessId, name: business.businessName, description: null, contactEmail: null, contactPhone: null, websiteUrl: null, timezone: 'UTC', openingHours: null, retentionDays: null, createdAt: '2026-11-27T00:00:00Z', updatedAt: '2026-11-27T00:00:00Z' }, membership: { id: business.membershipId, role: business.role } });
    // Branding falls back to the real centralized local config.
    if (path === '/branding') return send({ error: { code: 'UNAVAILABLE', message: 'Use local branding' } }, 503);
    if (path === '/health') return send({status:'ok',service:'OnusSync business API',timestamp:'2026-11-27T00:00:00Z'});
    if (path === '/health/ready') return send({status:'ok',database:'ready'});
    return send({ status: 'ok' });
  });
  return { page, context, requests };
}



export { fixture, memberships, baseUrl };
