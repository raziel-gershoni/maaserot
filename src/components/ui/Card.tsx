import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One card recipe for the whole app: surface, hairline, soft shadow.
 * Border OR shadow — never the doubled separation the old screens had.
 */
export function Card({
  as: Tag = 'section',
  padded = true,
  className,
  children,
}: {
  as?: ElementType;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-line bg-surface shadow-card',
        padded && 'p-5 sm:p-6',
        className
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * The ledger rule: a label, then a hairline that eats the remaining width.
 * Built from flex + a flex-1 hairline, so it is direction-agnostic and cannot
 * break under dir="rtl".
 */
export function SectionRule({
  children,
  trailing,
  className,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('ledger-rule', className)}>
      <span className="text-eyebrow text-ink-faint uppercase">{children}</span>
      <span className="ledger-rule-line" aria-hidden="true" />
      {trailing}
    </div>
  );
}

export function CardHeader({
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
    <div
      className={cn('flex flex-wrap items-start justify-between gap-3', className)}
    >
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
