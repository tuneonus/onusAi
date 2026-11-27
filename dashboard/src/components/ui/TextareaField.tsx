import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';
import './FormField.css';
import './SelectField.css';

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
}

export function TextareaField({
  id,
  label,
  error,
  hint,
  required,
  className,
  ...textareaProps
}: TextareaFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-field__label">
        {label}
        {required && (
          <span className="ui-field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <textarea
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={cn(
          'ui-textarea',
          Boolean(error) && 'ui-textarea--error',
          className,
        )}
        {...textareaProps}
      />

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

