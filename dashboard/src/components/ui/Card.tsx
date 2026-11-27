import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import './Card.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  accent?: boolean;
}

export function Card({ accent = false, className, children, ...rest }: CardProps) {
  return (
    <section className={cn('ui-card', accent && 'ui-card--accent', className)} {...rest}>
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function CardHeader({ title, subtitle, actions }: CardHeaderProps) {
  return (
    <header className="ui-card__header">
      <div>
        <h2 className="ui-card__title">{title}</h2>
        {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-card__actions">{actions}</div>}
    </header>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('ui-card__body', className)} {...rest}>
      {children}
    </div>
  );
}
