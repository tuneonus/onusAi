import assert from 'node:assert/strict';
import { test } from 'node:test';

Object.assign(process.env, {
  PORT: '3000',
  NODE_ENV: 'test',
  CORS_ORIGIN: 'http://localhost:5173',
  AI_SERVICE_URL: 'http://127.0.0.1:8001',
  AI_SERVICE_TIMEOUT_MS: '5000',
  DATABASE_URL: 'postgresql://test:example-password@127.0.0.1:5433/onusai',
  DATABASE_CONNECTION_TIMEOUT_MS: '5000',
  DATABASE_IDLE_TIMEOUT_MS: '30000',
  DATABASE_QUERY_TIMEOUT_MS: '5000',
});

const {
  validateCreateBusinessInput,
  validateCreateLocationInput,
  validateIncludeArchivedQuery,
  validateLocationAddress,
  validateOpeningHours,
  validateTimezone,
  validateUpdateBusinessInput,
  validateUpdateLocationInput,
} = await import('../dist/modules/businesses/businesses.validation.js');
const { HttpError } = await import('../dist/utils/http-error.js');

function buildValidHours(overrides = {}) {
  return {
    monday: { closed: false, open: '09:00', close: '17:00' },
    tuesday: { closed: false, open: '09:00', close: '17:00' },
    wednesday: { closed: false, open: '09:00', close: '17:00' },
    thursday: { closed: false, open: '09:00', close: '17:00' },
    friday: { closed: false, open: '18:00', close: '02:00' },
    saturday: { closed: false, open: '10:00', close: '18:00' },
    sunday: { closed: true },
    ...overrides,
  };
}

test('validateTimezone accepts canonical IANA zones and rejects abbreviations/offsets', () => {
  for (const zone of [
    'UTC',
    'Etc/UTC',
    'Asia/Kolkata',
    'America/New_York',
    'America/Argentina/Buenos_Aires',
    '  Europe/London  ',
  ]) {
    assert.equal(validateTimezone(zone), zone.trim());
  }

  for (const invalid of ['', '   ', 'EST', 'PST', 'GMT', '+05:30', 'UTC+5', 'Invalid/Zone', 'asia/kolkata', 123, null]) {
    assert.throws(() => validateTimezone(invalid), HttpError);
  }
});

test('validateOpeningHours handles closed days, overnight hours, and cross-day overlap edge cases', () => {
  const valid = validateOpeningHours(buildValidHours());
  assert.equal(valid.friday.closed, false);
  assert.equal(valid.sunday.closed, true);

  // Back-to-back handoff at 02:00 and Sunday overnight into Monday without overlap are valid.
  assert.doesNotThrow(() =>
    validateOpeningHours(
      buildValidHours({
        friday: { closed: false, open: '18:00', close: '02:00' },
        saturday: { closed: false, open: '02:00', close: '10:00' },
        sunday: { closed: false, open: '21:00', close: '03:00' },
        monday: { closed: false, open: '09:00', close: '17:00' },
      }),
    ),
  );

  // Overnight into a closed day is valid.
  assert.doesNotThrow(() =>
    validateOpeningHours(
      buildValidHours({
        saturday: { closed: false, open: '20:00', close: '04:00' },
        sunday: { closed: true },
      }),
    ),
  );

  // Overlapping overnight carryover (Friday 18:00-03:00 overlaps Saturday 02:00-10:00).
  assert.throws(
    () =>
      validateOpeningHours(
        buildValidHours({
          friday: { closed: false, open: '18:00', close: '03:00' },
          saturday: { closed: false, open: '02:00', close: '10:00' },
        }),
      ),
    (error) => error instanceof HttpError && /overlap/i.test(error.message),
  );

  // Overlapping Sunday overnight into Monday morning.
  assert.throws(
    () =>
      validateOpeningHours(
        buildValidHours({
          sunday: { closed: false, open: '22:00', close: '04:00' },
          monday: { closed: false, open: '03:30', close: '12:00' },
        }),
      ),
    (error) => error instanceof HttpError && /overlap/i.test(error.message),
  );

  // Closed day cannot carry open/close times; open day cannot have equal open/close or malformed time.
  const incomplete = buildValidHours();
  delete incomplete.sunday;
  for (const bad of [
    null,
    [],
    incomplete,
    { ...buildValidHours(), funday: { closed: true } },
    buildValidHours({ sunday: { closed: true, open: '09:00' } }),
    buildValidHours({ monday: { closed: false, open: '09:00', close: '09:00' } }),
    buildValidHours({ monday: { closed: false, open: '9:00', close: '17:00' } }),
    buildValidHours({ monday: { closed: false, open: '09:00', close: '24:00' } }),
    buildValidHours({ monday: { closed: false, open: '09:00', close: '17:00', extra: true } }),
  ]) {
    assert.throws(() => validateOpeningHours(bad), HttpError);
  }
});

test('business create and patch validation normalizes fields and rejects invalid payloads', () => {
  const created = validateCreateBusinessInput({
    name: '  Acme Clinic  ',
    description: '  Neighborhood care  ',
    contactEmail: '  Hello@Acme.Test ',
    contactPhone: ' +1 (555) 010-2000 ',
    websiteUrl: ' https://acme.test/clinic ',
    timezone: 'America/New_York',
    openingHours: buildValidHours(),
  });
  assert.equal(created.name, 'Acme Clinic');
  assert.equal(created.description, 'Neighborhood care');
  assert.equal(created.contactEmail, 'hello@acme.test');
  assert.equal(created.contactPhone, '+1 (555) 010-2000');
  assert.equal(created.websiteUrl, 'https://acme.test/clinic');

  const minimal = validateCreateBusinessInput({ name: 'Minimal Co' });
  assert.deepEqual(minimal, {
    name: 'Minimal Co',
    description: null,
    contactEmail: null,
    contactPhone: null,
    websiteUrl: null,
    timezone: null,
    openingHours: null,
    retentionDays: null,
  });

  const patched = validateUpdateBusinessInput({
    description: null,
    contactEmail: 'Support@Acme.Test',
  });
  assert.deepEqual(patched, {
    description: null,
    contactEmail: 'support@acme.test',
  });

  for (const invalid of [
    {},
    { name: null },
    { name: '   ' },
    { unknown: 'value' },
    { contactEmail: 'not-an-email' },
    { contactPhone: '---' },
    { websiteUrl: 'ftp://acme.test' },
    { websiteUrl: 'https://user:pass@acme.test' },
    { timezone: 'EST' },
  ]) {
    assert.throws(() => validateUpdateBusinessInput(invalid), HttpError);
  }
});

test('location address, create, patch, and query validation enforce strict rules', () => {
  assert.deepEqual(
    validateLocationAddress({
      line1: ' 100 Main St ',
      city: ' Austin ',
      countryCode: ' us ',
    }),
    {
      line1: '100 Main St',
      line2: null,
      city: 'Austin',
      stateRegion: null,
      postalCode: null,
      countryCode: 'US',
    },
  );

  for (const badAddr of [
    null,
    { line1: '100 Main St', city: 'Austin' },
    { line1: '100 Main St', city: 'Austin', countryCode: 'USA' },
    { line1: '100 Main St', city: 'Austin', countryCode: 'US', extra: 'x' },
  ]) {
    assert.throws(() => validateLocationAddress(badAddr), HttpError);
  }

  const loc = validateCreateLocationInput({
    name: ' Downtown ',
    timezone: 'Asia/Kolkata',
    openingHours: buildValidHours(),
  });
  assert.equal(loc.name, 'Downtown');
  assert.equal(loc.timezone, 'Asia/Kolkata');
  assert.equal(loc.address, null);

  assert.throws(() => validateCreateLocationInput({ name: 'Missing TZ' }), HttpError);
  assert.throws(() => validateUpdateLocationInput({}), HttpError);
  assert.throws(() => validateUpdateLocationInput({ name: null }), HttpError);
  assert.throws(() => validateUpdateLocationInput({ timezone: null }), HttpError);
  assert.deepEqual(validateUpdateLocationInput({ address: null }), { address: null });

  assert.equal(validateIncludeArchivedQuery(undefined), false);
  assert.equal(validateIncludeArchivedQuery('false'), false);
  assert.equal(validateIncludeArchivedQuery('true'), true);
  assert.throws(() => validateIncludeArchivedQuery('yes'), HttpError);
  assert.throws(() => validateIncludeArchivedQuery(['true']), HttpError);
});

