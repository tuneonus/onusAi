import { HttpError } from '../../utils/http-error.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PASSWORD_LENGTH = 128;

export interface LoginInput {
  email: string;
  password: string;
}

export function validateLoginInput(body: unknown): LoginInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const keys = Object.keys(body);

  if (keys.some((key) => key !== 'email' && key !== 'password')) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body contains unsupported fields.');
  }

  const record = body as Record<string, unknown>;

  if (typeof record.email !== 'string' || typeof record.password !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Email and password must be strings.');
  }

  const email = record.email.trim().toLowerCase();

  if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Email must be a valid email address.');
  }

  if (record.password.length < 1 || record.password.length > MAX_PASSWORD_LENGTH) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Password must be between 1 and 128 characters.');
  }

  return { email, password: record.password };
}

export function validateUuid(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Invalid ${fieldName}.`);
  }

  return value.toLowerCase();
}

