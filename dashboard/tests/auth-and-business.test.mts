import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLoginForm } from '../src/features/auth/validation.ts';
import { resolveActiveBusinessId } from '../src/features/businesses/tenantSelection.ts';
import {
  buildBusinessPatchPayload,
  buildDefaultOpeningHours,
  createEmptyBusinessFormValues,
  validateBusinessForm,
  validateOpeningHoursValue,
  validateTimezoneValue,
} from '../src/features/businesses/validation.ts';
import { cn } from '../src/utils/cn.ts';
import { readCookie } from '../src/utils/cookies.ts';

test('validateLoginForm normalizes email and enforces field rules', () => {
  const valid = validateLoginForm({
    email: '  Owner@Northstar.Example  ',
    password: 'MySecretPassword123',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.normalized, {
    email: 'owner@northstar.example',
    password: 'MySecretPassword123',
  });

  const invalid = validateLoginForm({ email: 'not-an-email', password: '' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.email);
  assert.ok(invalid.errors.password);
});

test('validateTimezoneValue accepts valid IANA zones and rejects invalid zones', () => {
  assert.equal(validateTimezoneValue(''), null);
  assert.equal(validateTimezoneValue('UTC'), null);
  assert.equal(validateTimezoneValue('America/New_York'), null);
  assert.equal(validateTimezoneValue('Asia/Kolkata'), null);
  assert.ok(validateTimezoneValue('Invalid/Timezone'));
  assert.ok(validateTimezoneValue('EST'));
});

test('validateOpeningHoursValue handles normal, overnight, and overlapping overnight shifts', () => {
  const validHours = buildDefaultOpeningHours();
  assert.deepEqual(validateOpeningHoursValue(validHours).dayErrors, {});

  const overnightOk = {
    ...validHours,
    friday: { closed: false as const, open: '20:00', close: '02:00' },
    saturday: { closed: false as const, open: '09:00', close: '17:00' },
  };
  assert.deepEqual(validateOpeningHoursValue(overnightOk).dayErrors, {});

  const sundayOverlap = {
    ...validHours,
    sunday: { closed: false as const, open: '22:00', close: '10:00' },
    monday: { closed: false as const, open: '09:00', close: '17:00' },
  };
  const overlapResult = validateOpeningHoursValue(sundayOverlap);
  assert.ok(overlapResult.summaryError);
  assert.ok(overlapResult.dayErrors.monday);
});

test('validateBusinessForm and buildBusinessPatchPayload match backend rules', () => {
  const form = {
    ...createEmptyBusinessFormValues(),
    name: '  Northstar Dental Clinic  ',
    contactEmail: ' Care@Northstar.Example ',
    contactPhone: '+1 (555) 234-5678',
    websiteUrl: 'https://northstar.example',
    timezone: 'America/New_York',
    retentionDays: '90',
  };

  const result = validateBusinessForm(form);
  assert.equal(result.valid, true);
  assert.equal(result.payload.name, 'Northstar Dental Clinic');
  assert.equal(result.payload.contactEmail, 'care@northstar.example');
  assert.equal(result.payload.retentionDays, 90);
  assert.equal(result.payload.description, null);

  const existing = {
    id: 'b-1',
    name: 'Northstar Dental Clinic',
    description: 'General dentistry',
    contactEmail: 'care@northstar.example',
    contactPhone: '+1 (555) 234-5678',
    websiteUrl: 'https://northstar.example',
    timezone: 'America/New_York',
    openingHours: null,
    retentionDays: 90,
    createdAt: '2026-11-27T00:00:00.000Z',
    updatedAt: '2026-11-27T00:00:00.000Z',
  };

  const patch = buildBusinessPatchPayload(existing, result.payload);
  assert.deepEqual(patch, { description: null });

  const invalidForm = validateBusinessForm({
    ...createEmptyBusinessFormValues(),
    name: '',
    websiteUrl: 'ftp://invalid.example',
    retentionDays: '5000',
  });
  assert.equal(invalidForm.valid, false);
  assert.ok(invalidForm.errors.name);
  assert.ok(invalidForm.errors.websiteUrl);
  assert.ok(invalidForm.errors.retentionDays);
});

test('resolveActiveBusinessId validates stored ID against verified memberships', () => {
  const memberships = [
    { membershipId: 'm1', businessId: 'b1', businessName: 'Northstar', role: 'owner' as const },
    { membershipId: 'm2', businessId: 'b2', businessName: 'Beacon', role: 'operator' as const },
  ];

  assert.equal(resolveActiveBusinessId(memberships, 'b2'), 'b2');
  assert.equal(resolveActiveBusinessId(memberships, 'foreign-id'), 'b1');
  assert.equal(resolveActiveBusinessId([], 'b1'), null);
});

test('shared utility helpers behave deterministically', () => {
  assert.equal(cn('a', false, undefined, 'b'), 'a b');
  assert.equal(readCookie('onussync_csrf'), null);
});

