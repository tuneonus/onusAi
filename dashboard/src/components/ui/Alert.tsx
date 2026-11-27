import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import './Alert.css';

export interface AlertProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';

  return (
    <div role={role} className={cn('ui-alert', `ui-alert--${tone}`, className)}>
      {title && <div className="ui-alert__title">{title}</div>}
      <div className="ui-alert__body">{children}</div>
    </div>
  );
}

