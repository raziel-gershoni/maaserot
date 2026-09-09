import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * An empty screen is an invitation to act, so this always leaves room for one.
 * Distinct from a failed fetch — see `Alert tone="error"` for that.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-row border border-dashed border-line-strong',
        'px-6 py-10 text-center',
        className
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-ink-faint"
        >
          {icon}
        </div>
      ) : null}
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
