import assert from 'node:assert/strict';
import test from 'node:test';
import {
  archiveBusinessLocation,
  createBusinessLocation,
  getBusinessLocation,
  listBusinessLocations,
  updateBusinessLocation,
} from '../src/features/locations/api.ts';
import type { BusinessLocation } from '../src/features/locations/types.ts';
import {
  buildLocationPatchPayload,
  createEmptyLocationFormValues,
  filterLocationsByMode,
  formatLocationAddress,
  locationToFormValues,
  validateLocationForm,
} from '../src/features/locations/validation.ts';
import {
  ApiClientError,
  setCsrfToken,
} from '../src/services/api/client.ts';
import { buildDefaultOpeningHours } from '../src/validation/common.ts';

function makeLocation(overrides: Partial<BusinessLocation> = {}): BusinessLocation {
  return {
    id: 'loc-1',
    businessId: 'biz-1',
    name: 'Main Clinic',
    address: {
      line1: '100 Main St',
      line2: null,
      city: 'Boston',
      stateRegion: 'MA',
      postalCode: '02108',
      countryCode: 'US',
    },
    contactEmail: 'main@clinic.example',
    contactPhone: '+1 (555) 111-2222',
    timezone: 'America/New_York',
    openingHours: null,
    archivedAt: null,
    createdAt: '2026-11-27T00:00:00.000Z',
    updatedAt: '2026-11-27T00:00:00.000Z',
    ...overrides,
  };
}

test('validateLocationForm validates required fields, address, and opening hours', () => {
  const emptyInvalid = validateLocationForm(createEmptyLocationFormValues());
  assert.equal(emptyInvalid.valid, false);
  assert.ok(emptyInvalid.errors.name);
  assert.ok(emptyInvalid.errors.timezone);

  const valid = validateLocationForm({
    name: '  Downtown Clinic  ',
    timezone: 'America/Chicago',
    contactEmail: ' Desk@Clinic.Example ',
    contactPhone: '+1 555-333-4444',
    includeAddress: true,
    address: {
      line1: ' 200 Elm St ',
      line2: 'Suite 4',
      city: 'Austin',
      stateRegion: 'TX',
      postalCode: '78701',
      countryCode: 'us',
    },
    openingHours: buildDefaultOpeningHours(),
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.payload.name, 'Downtown Clinic');
  assert.equal(valid.payload.timezone, 'America/Chicago');
  assert.equal(valid.payload.contactEmail, 'desk@clinic.example');
  assert.equal(valid.payload.address?.countryCode, 'US');

  const invalidAddress = validateLocationForm({
    ...createEmptyLocationFormValues('UTC'),
    name: 'Branch',
    includeAddress: true,
    address: {
      line1: '',
      line2: '',
      city: '',
      stateRegion: '',
      postalCode: '',
      countryCode: 'USA',
    },
  });
  assert.equal(invalidAddress.valid, false);
  assert.ok(invalidAddress.errors.address?.line1);
  assert.ok(invalidAddress.errors.address?.city);
  assert.ok(invalidAddress.errors.address?.countryCode);
});

test('buildLocationPatchPayload computes minimal updates including clearing address', () => {
  const original = makeLocation();
  const formValues = locationToFormValues(original);
  formValues.includeAddress = false;
  formValues.name = 'Main Clinic West';

  const validated = validateLocationForm(formValues);
  assert.equal(validated.valid, true);

  const patch = buildLocationPatchPayload(original, validated.payload);
  assert.deepEqual(patch, {
    name: 'Main Clinic West',
    address: null,
  });
});

test('filterLocationsByMode and formatLocationAddress handle active and archived records', () => {
  const active = makeLocation({ id: 'loc-active', archivedAt: null });
  const archived = makeLocation({
    id: 'loc-archived',
    name: 'Old Branch',
    archivedAt: '2026-11-27T10:00:00.000Z',
  });

  assert.deepEqual(
    filterLocationsByMode([active, archived], 'active').map((l) => l.id),
    ['loc-active'],
  );
  assert.deepEqual(
    filterLocationsByMode([active, archived], 'archived').map((l) => l.id),
    ['loc-archived'],
  );
  assert.deepEqual(
    filterLocationsByMode([active, archived], 'all').map((l) => l.id),
    ['loc-active', 'loc-archived'],
  );

  assert.equal(
    formatLocationAddress(active.address),
    '100 Main St · Boston, MA, 02108 · US',
  );
  assert.equal(formatLocationAddress(null), null);
});

test('location API service scopes requests to tenant, sends CSRF on mutations, and surfaces RBAC/conflict errors', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; csrf: string | null }> = [];

  try {
    setCsrfToken('csrf-loc-token');

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      requests.push({ url, method, csrf: headers.get('X-CSRF-Token') });

      if (url.includes('/businesses/foreign-biz/')) {
        return new Response(
          JSON.stringify({
            error: { code: 'TENANT_ACCESS_DENIED', message: 'You do not have access to this business.' },
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (method === 'POST' && url.endsWith('/locations')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'LOCATION_NAME_CONFLICT',
              message: 'An active location with this name already exists for this business.',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (method === 'DELETE') {
        return new Response(
          JSON.stringify({
            businessId: 'biz-1',
            location: makeLocation({ archivedAt: '2026-11-27T12:00:00.000Z' }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (method === 'PATCH') {
        return new Response(
          JSON.stringify({
            businessId: 'biz-1',
            location: makeLocation({ name: 'Updated Branch' }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/locations/loc-1')) {
        return new Response(
          JSON.stringify({ businessId: 'biz-1', location: makeLocation() }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({ businessId: 'biz-1', locations: [makeLocation()] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const listed = await listBusinessLocations('biz-1', true);
    assert.equal(listed.locations.length, 1);
    assert.ok(requests[0].url.endsWith('/api/v1/businesses/biz-1/locations?includeArchived=true'));
    assert.equal(requests[0].csrf, null);

    const fetched = await getBusinessLocation('biz-1', 'loc-1');
    assert.equal(fetched.location.id, 'loc-1');

    const updated = await updateBusinessLocation('biz-1', 'loc-1', { name: 'Updated Branch' });
    assert.equal(updated.location.name, 'Updated Branch');
    assert.equal(requests[2].method, 'PATCH');
    assert.equal(requests[2].csrf, 'csrf-loc-token');

    const archived = await archiveBusinessLocation('biz-1', 'loc-1');
    assert.ok(archived.location.archivedAt);
    assert.equal(requests[3].method, 'DELETE');
    assert.equal(requests[3].csrf, 'csrf-loc-token');

    await assert.rejects(
      () =>
        createBusinessLocation('biz-1', {
          name: 'Main Clinic',
          timezone: 'America/New_York',
          address: null,
          contactEmail: null,
          contactPhone: null,
          openingHours: null,
        }),
      (error: unknown) =>
        error instanceof ApiClientError &&
        error.status === 409 &&
        error.code === 'LOCATION_NAME_CONFLICT',
    );

    await assert.rejects(
      () => listBusinessLocations('foreign-biz', false),
      (error: unknown) =>
        error instanceof ApiClientError &&
        error.status === 403 &&
        error.code === 'TENANT_ACCESS_DENIED',
    );
  } finally {
    setCsrfToken(null);
    globalThis.fetch = originalFetch;
  }
});

