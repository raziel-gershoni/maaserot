import { cn } from '@/lib/utils';
import { Money } from './Money';

export interface ReckoningSegment {
  key: string;
  label: string;
  agorot: number;
  /** Clamped share of the track. May be less than `agorot` when overpaid. */
  width: number;
  /** Tailwind background utility for the segment fill. */
  fill: string;
  /** Tailwind background utility for the legend dot. */
  dot: string;
}

/**
 * The reckoning bar — one stacked measure of a month's maaser obligation,
 * split into what is already committed, what has been paid, and what is still
 * owed.
 *
 * Remaining is the only fully-saturated colour on the screen: the whole app
 * exists to drive that segment to zero, so it is the one thing allowed to
 * shout. Everything else is a tint.
 */
export function ReckoningBar({
  totalMaaser,
  fixedCharities,
  paid,
  locale = 'he',
  labels,
  className,
}: {
  totalMaaser: number;
  fixedCharities: number;
  paid: number;
  locale?: string;
  labels: { fixed: string; paid: string; remaining: string; empty: string };
  className?: string;
}) {
  // Geometry is clamped so the segments can never overflow the track, but the
  // legend must report the REAL amounts — otherwise an overpaid month shows a
  // smaller "paid" here than the stat tile beside it, under the same label.
  const fixedWidth = Math.max(0, Math.min(fixedCharities, totalMaaser));
  const paidWidth = Math.max(0, Math.min(paid, totalMaaser - fixedWidth));
  const remaining = Math.max(0, totalMaaser - fixedCharities - paid);

  const segments: ReckoningSegment[] = [
    {
      key: 'fixed',
      label: labels.fixed,
      agorot: fixedCharities,
      width: fixedWidth,
      fill: 'bg-accent/45',
      dot: 'bg-accent/45',
    },
    {
      key: 'paid',
      label: labels.paid,
      agorot: paid,
      width: paidWidth,
      fill: 'bg-positive/55',
      dot: 'bg-positive/55',
    },
    {
      key: 'remaining',
      label: labels.remaining,
      agorot: remaining,
      width: remaining,
      fill: 'bg-brand',
      dot: 'bg-brand',
    },
  ];

  const visible = segments.filter((s) => s.width > 0);
  const hasTotal = totalMaaser > 0;

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={
          hasTotal
            ? visible
                .map(
                  (s) =>
                    `${s.label}: ${new Intl.NumberFormat(
                      locale === 'he' ? 'he-IL' : 'en-US',
                      { style: 'currency', currency: 'ILS' }
                    ).format(s.agorot / 100)}`
                )
                .join(', ')
            : labels.empty
        }
      >
        {hasTotal
          ? visible.map((s, i) => (
              <div
                key={s.key}
                className={cn('animate-measure h-full', s.fill)}
                style={{
                  width: `${(s.width / totalMaaser) * 100}%`,
                  animationDelay: `${i * 90}ms`,
                }}
              />
            ))
          : null}
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)}
            />
            <span className="text-xs text-ink-muted">{s.label}</span>
            <Money
              agorot={s.agorot}
              locale={locale}
              size="inherit"
              tone={s.key === 'remaining' ? 'default' : 'muted'}
              className="text-xs"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
