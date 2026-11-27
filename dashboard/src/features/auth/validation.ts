import type { LoginInput } from './types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
const MAX_PASSWORD_LENGTH = 128;

export interface LoginFormErrors {
  email?: string;
  password?: string;
}

export function validateLoginForm(values: LoginInput): {
  valid: boolean;
  normalized: LoginInput;
  errors: LoginFormErrors;
} {
  const errors: LoginFormErrors = {};
  const email = values.email.trim().toLowerCase();

  if (email.length === 0) {
    errors.email = 'Email address is required.';
  } else if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (values.password.length === 0) {
    errors.password = 'Password is required.';
  } else if (values.password.length > MAX_PASSWORD_LENGTH) {
    errors.password = 'Password must be at most 128 characters.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    normalized: { email, password: values.password },
    errors,
  };
}

