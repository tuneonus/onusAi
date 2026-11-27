import { cn } from '../../utils/cn';
import './Spinner.css';

export interface SpinnerProps {
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('ui-spinner', `ui-spinner--${size}`, className)}
    />
  );
}

