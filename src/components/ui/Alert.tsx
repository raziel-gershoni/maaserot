import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  info: 'bg-brand-soft text-brand-soft-ink border-brand-line',
  success: 'bg-positive-soft text-positive-soft-ink border-positive/25',
  warning: 'bg-caution-soft text-caution-soft-ink border-caution/30',
  error: 'bg-critical-soft text-critical-soft-ink border-critical/30',
} as const;

/**
 * One alert treatment, four semantics. `error` and `warning` announce
 * themselves; `info` and `success` are polite.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof TONES;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'rounded-row border px-4 py-3 text-sm',
        TONES[tone],
        className
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? (
        <div className={cn('leading-relaxed', title && 'mt-0.5')}>{children}</div>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
