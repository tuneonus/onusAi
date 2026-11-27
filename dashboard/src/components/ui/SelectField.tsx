import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';
import './FormField.css';
import './SelectField.css';

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  compact?: boolean;
  hideLabel?: boolean;
}

export function SelectField({
  id,
  label,
  error,
  hint,
  required,
  compact = false,
  hideLabel = false,
  className,
  children,
  ...selectProps
}: SelectFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className="ui-field">
      <label
        htmlFor={id}
        className={cn('ui-field__label', hideLabel && 'sr-only')}
      >
        {label}
        {required && (
          <span className="ui-field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <select
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={cn(
          'ui-select',
          compact && 'ui-select--compact',
          Boolean(error) && 'ui-select--error',
          className,
        )}
        {...selectProps}
      >
        {children}
      </select>

      {hint && (
        <span id={hintId} className="ui-field__hint">
          {hint}
        </span>
      )}

      {error && (
        <span id={errorId} role="alert" className="ui-field__error">
          {error}
        </span>
      )}
    </div>
  );
}

