import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '../../utils/cn';
import { Spinner } from './Spinner';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'ui-button',
        `ui-button--${variant}`,
        `ui-button--${size}`,
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

