import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One page title treatment. The old screens split between a responsive h1 on
 * two pages and a flat text-4xl on four others.
 */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn('flex flex-wrap items-end justify-between gap-3', className)}
    >
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
