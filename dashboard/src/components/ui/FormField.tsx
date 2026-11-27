import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import './FormField.css';

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  endAdornment?: ReactNode;
}

export function FormField({
  id,
  label,
  error,
  hint,
  required,
  endAdornment,
  className,
  ...inputProps
}: FormFieldProps) {
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

      <div className="ui-field__input-wrap">
        <input
          id={id}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            'ui-field__input',
            Boolean(endAdornment) && 'ui-field__input--with-end',
            Boolean(error) && 'ui-field__input--error',
            className,
          )}
          {...inputProps}
        />
        {endAdornment && <div className="ui-field__end-slot">{endAdornment}</div>}
      </div>

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

