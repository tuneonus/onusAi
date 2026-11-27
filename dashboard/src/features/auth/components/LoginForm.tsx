import { useState, type FormEvent } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { Icon } from '../../../components/ui/Icons';
import { ApiClientError } from '../../../services/api/client';
import { useAuth } from '../useAuth';
import { validateLoginForm, type LoginFormErrors } from '../validation';
import './LoginForm.css';

interface LoginFormProps {
  onSuccess?: () => void;
}

function formatRetryDuration(seconds: number | null): string {
  if (!seconds) {
    return 'Please wait a moment before trying again.';
  }

  if (seconds < 60) {
    return `Please try again in ${seconds} second${seconds === 1 ? '' : 's'}.`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { login, sessionNotice, clearSessionNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFormErrors>({});
  const [submitError, setSubmitError] = useState<{
    title: string;
    message: string;
    tone: 'danger' | 'warning';
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearSessionNotice();
    setSubmitError(null);

    const validation = validateLoginForm({ email, password });
    setFieldErrors(validation.errors);

    if (!validation.valid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login(validation.normalized);
      onSuccess?.();
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.status === 429) {
          setSubmitError({
            title: 'Too many sign-in attempts',
            message: `${error.message} ${formatRetryDuration(error.retryAfterSeconds)}`,
            tone: 'warning',
          });
        } else {
          setSubmitError({
            title: error.status === 401 ? 'Sign-in failed' : 'Unable to sign in',
            message: error.message,
            tone: 'danger',
          });
        }
      } else {
        setSubmitError({
          title: 'Unable to sign in',
          message: 'An unexpected error occurred while signing in.',
          tone: 'danger',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      {sessionNotice && (
        <Alert tone="warning" title="Session ended">
          {sessionNotice}
        </Alert>
      )}

      {submitError && (
        <Alert tone={submitError.tone} title={submitError.title}>
          {submitError.message}
        </Alert>
      )}

      <FormField
        id="staff-email"
        name="email"
        type="email"
        autoComplete="email"
        label="Work email"
        placeholder="owner@business.example"
        required
        disabled={isSubmitting}
        value={email}
        error={fieldErrors.email}
        onChange={(event) => {
          setEmail(event.target.value);
          if (fieldErrors.email) {
            setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }
        }}
      />

      <FormField
        id="staff-password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        label="Password"
        placeholder="Enter your password"
        required
        disabled={isSubmitting}
        value={password}
        error={fieldErrors.password}
        onChange={(event) => {
          setPassword(event.target.value);
          if (fieldErrors.password) {
            setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }
        }}
        endAdornment={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="login-form__toggle"
            disabled={isSubmitting}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            <Icon name={showPassword ? 'eyeOff' : 'eye'} size={15} />
          </Button>
        }
      />

      <Button type="submit" loading={isSubmitting} className="login-form__submit">
        {isSubmitting ? 'Signing in...' : 'Sign in to workspace'}
      </Button>

      <div className="login-form__security-note">
        <Icon name="shield" size={14} />
        <span>Protected by HTTP-only sessions and CSRF verification</span>
      </div>
    </form>
  );
}
