import assert from 'node:assert/strict';
import test from 'node:test';
import { getVisibleNavItems, ROUTES } from '../src/config/routes.ts';
import type { UserMembershipSummary } from '../src/features/auth/types.ts';
import { listBusinessMembers } from '../src/features/staff/api.ts';
import { canViewStaff, ROLE_PERMISSIONS } from '../src/features/staff/permissions.ts';
import { getStaffInitials, summarizeStaff } from '../src/features/staff/summary.ts';
import type { StaffMember } from '../src/features/staff/types.ts';
import { ApiClientError, getCsrfToken, setCsrfToken, setUnauthorizedHandler } from '../src/services/api/client.ts';

const owner: UserMembershipSummary = {
  membershipId: 'membership-a', businessId: 'business-a', businessName: 'Business A', role: 'owner',
};
const member: StaffMember = {
  membershipId: 'membership-a', userId: 'user-a', displayName: 'Avery Stone',
  email: 'avery@example.test', role: 'owner', createdAt: '2026-11-27T00:00:00.000Z',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

test('staff access fails closed for operators and absent roles', () => {
  assert.equal(canViewStaff('owner'), true);
  assert.equal(canViewStaff('operator'), false);
  assert.equal(canViewStaff(null), false);
  assert.equal(canViewStaff(undefined), false);
});

test('owner navigation exposes the implemented staff route; operator and absent membership hide it', () => {
  const staff = getVisibleNavItems('owner').find((item) => item.path === ROUTES.staff);
  assert.equal(staff?.implemented, true);
  for (const role of ['operator', null, undefined] as const) {
    assert.equal(getVisibleNavItems(role).some((item) => item.path === ROUTES.staff), false);
    assert.ok(getVisibleNavItems(role).some((item) => item.path === ROUTES.locations));
  }
});

test('permissions overview distinguishes administration from operator conversation access', () => {
  assert.ok(ROLE_PERMISSIONS.every((permission) => permission.owner));
  assert.equal(ROLE_PERMISSIONS.find((permission) => permission.label === 'View staff directory')?.operator, false);
  assert.equal(ROLE_PERMISSIONS.find((permission) => permission.label === 'Use playground & manage conversation status')?.operator, true);
  assert.equal(ROLE_PERMISSIONS.find((permission) => permission.label === 'Delete & permanently purge conversations')?.operator, false);
});

test('staff summaries count only the supplied business members, including an empty directory', () => {
  assert.deepEqual(summarizeStaff([]), { total: 0, owners: 0, operators: 0 });
  const members = [member, { ...member, membershipId: 'm-2' }, { ...member, membershipId: 'm-3', role: 'operator' as const }];
  assert.deepEqual(summarizeStaff(members), { total: 3, owners: 2, operators: 1 });
  assert.deepEqual(summarizeStaff([{ ...member, role: 'operator' }]), { total: 1, owners: 0, operators: 1 });
});

test('initials handle whitespace, single names, multiple names and Unicode', () => {
  assert.equal(getStaffInitials('  Avery  Quinn Stone  '), 'AS');
  assert.equal(getStaffInitials('Avery'), 'AV');
  assert.equal(getStaffInitials('李 明'), '李明');
  assert.equal(getStaffInitials(''), '?');
});

test('staff API makes tenant-scoped credentialed GET requests with the cancellation signal', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; setCsrfToken(null); });
  setCsrfToken('staff-csrf');
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    const businessId = String(input).includes('business-b') ? 'business-b' : 'business-a';
    return json({ businessId, members: [member] });
  };
  const controller = new AbortController();
  assert.deepEqual(await listBusinessMembers(owner, controller.signal), { businessId: 'business-a', members: [member] });
  await listBusinessMembers({ ...owner, businessId: 'business-b' }, controller.signal);
  assert.ok(requests[0].url.endsWith('/api/v1/businesses/business-a/members'));
  assert.ok(requests[1].url.endsWith('/api/v1/businesses/business-b/members'));
  assert.equal(requests[0].init?.method, 'GET');
  assert.equal(requests[0].init?.credentials, 'include');
  assert.equal(requests[0].init?.signal, controller.signal);
  assert.equal(new Headers(requests[0].init?.headers).get('X-CSRF-Token'), null);
  assert.equal(getCsrfToken(), 'staff-csrf');
});

test('staff API never sends a request for an operator or missing business ID', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({}); };
  for (const membership of [{ ...owner, role: 'operator' as const }, { ...owner, businessId: '' }]) {
    await assert.rejects(() => listBusinessMembers(membership, new AbortController().signal),
      (error: unknown) => error instanceof ApiClientError && error.status === 403);
  }
  assert.equal(calls, 0);
});

test('staff API rejects pre-aborted requests without fetching', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({}); };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => listBusinessMembers(owner, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('staff API rejects a late response after abort even if the transport ignores cancellation', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const deferred = Promise.withResolvers<Response>();
  globalThis.fetch = () => deferred.promise;
  const controller = new AbortController();
  const pending = listBusinessMembers(owner, controller.signal);
  controller.abort();
  deferred.resolve(json({ businessId: owner.businessId, members: [member] }));
  await assert.rejects(() => pending, { name: 'AbortError' });
});

test('staff API accepts an empty directory', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => json({ businessId: owner.businessId, members: [] });
  assert.deepEqual((await listBusinessMembers(owner, new AbortController().signal)).members, []);
});

test('staff API rejects a response for another tenant before returning its members', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => json({ businessId: 'foreign-business', members: [member] });
  await assert.rejects(() => listBusinessMembers(owner, new AbortController().signal),
    (error: unknown) => error instanceof ApiClientError && error.code === 'INVALID_STAFF_RESPONSE');
});

test('staff API validates untrusted response shapes and member roles', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const body of [null, {}, { businessId: owner.businessId, members: null },
    ...[{ ...member, role: 'admin' }, { ...member, email: null }, { ...member, createdAt: 'invalid' }, null]
      .map((value) => ({ businessId: owner.businessId, members: [value] }))]) {
    globalThis.fetch = async () => json(body);
    await assert.rejects(() => listBusinessMembers(owner, new AbortController().signal),
      (error: unknown) => error instanceof ApiClientError && error.code === 'INVALID_STAFF_RESPONSE');
  }
});

test('staff 401 responses invoke existing session expiry and clear the CSRF token', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; setUnauthorizedHandler(null); setCsrfToken(null); });
  let expired = 0;
  setUnauthorizedHandler(() => { expired++; });
  setCsrfToken('expired-token');
  globalThis.fetch = async () => json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Session expired' } }, 401);
  await assert.rejects(() => listBusinessMembers(owner, new AbortController().signal),
    (error: unknown) => error instanceof ApiClientError && error.status === 401);
  assert.equal(expired, 1);
  assert.equal(getCsrfToken(), null);
});

test('staff 403 responses preserve the current session and report permission denial', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; setUnauthorizedHandler(null); });
  let expired = 0;
  setUnauthorizedHandler(() => { expired++; });
  globalThis.fetch = async () => json({ error: { code: 'TENANT_ACCESS_DENIED', message: 'Access denied' } }, 403);
  await assert.rejects(() => listBusinessMembers(owner, new AbortController().signal),
    (error: unknown) => error instanceof ApiClientError && error.status === 403 && error.code === 'TENANT_ACCESS_DENIED');
  assert.equal(expired, 0);
});

test('staff API surfaces server and network failures for retry', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' } }, 503);
  await assert.rejects(() => listBusinessMembers(owner, new AbortController().signal),
    (error: unknown) => error instanceof ApiClientError && error.status === 503 && error.message === 'Database is unavailable.');
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(() => listBusinessMembers(owner, new AbortController().signal),
    (error: unknown) => error instanceof ApiClientError && error.code === 'NETWORK_ERROR');
});
