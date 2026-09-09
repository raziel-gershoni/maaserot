import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  neutral: 'bg-surface-sunken text-ink-muted border-line',
  brand: 'bg-brand-soft text-brand-soft-ink border-brand-line',
  accent: 'bg-accent-soft text-accent-soft-ink border-accent/25',
  success: 'bg-positive-soft text-positive-soft-ink border-positive/25',
  warning: 'bg-caution-soft text-caution-soft-ink border-caution/30',
  critical: 'bg-critical-soft text-critical-soft-ink border-critical/30',
} as const;

/**
 * Status pill. The icon lives in its own element rather than glued onto the
 * front of a translated string — a neutral glyph concatenated to Hebrew text
 * gets positioned by the bidi algorithm, not by the layout.
 */
export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'text-xs font-semibold whitespace-nowrap',
        TONES[tone],
        className
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
