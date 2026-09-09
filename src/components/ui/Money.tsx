import { cn } from '@/lib/utils';

const SIZES = {
  inherit: '',
  sm: 'text-figure-sm',
  md: 'text-figure',
  lg: 'text-figure-lg',
} as const;

const TONES = {
  default: 'text-ink',
  muted: 'text-ink-muted',
  brand: 'text-brand',
  positive: 'text-positive',
  critical: 'text-critical',
  inherit: '',
} as const;

/**
 * The app is a number, so money gets one renderer.
 *
 * - `formatToParts` lets the currency symbol sit a step down in size and
 *   colour, so the digits carry the row instead of competing with ₪.
 * - `<bdi>` isolates the run: he-IL emits bidi control marks around the
 *   symbol, and without isolation an amount inside a Hebrew sentence
 *   reorders.
 * - Tabular figures so a column of amounts does not jitter between values.
 */
export function Money({
  agorot,
  locale = 'he',
  size = 'inherit',
  tone = 'default',
  weight = 'font-semibold',
  className,
}: {
  agorot: number;
  locale?: string;
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  weight?: string;
  className?: string;
}) {
  const parts = new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency: 'ILS',
  }).formatToParts(agorot / 100);

  return (
    // Plain inline spans, never flex. `formatToParts` returns parts in logical
    // order, and inline layout lets the bidi algorithm place them exactly as it
    // would the concatenated string. A flex container orders its children by
    // `direction` instead, which under dir="rtl" renders 620.00 as 00.620.
    <bdi
      className={cn(
        'tabular font-display',
        SIZES[size],
        TONES[tone],
        weight,
        className
      )}
    >
      {parts.map((part, i) =>
        part.type === 'currency' ? (
          <span key={i} className="text-[0.72em] font-medium opacity-60">
            {part.value}
          </span>
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </bdi>
  );
}

/**
 * A labelled figure — the pattern that appeared four different ways across the
 * old dashboard. One shape now.
 */
export function Figure({
  label,
  agorot,
  locale = 'he',
  size = 'md',
  tone = 'default',
  hint,
  className,
}: {
  label: string;
  agorot: number;
  locale?: string;
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-eyebrow uppercase text-ink-faint">{label}</div>
      <div className="mt-1">
        <Money agorot={agorot} locale={locale} size={size} tone={tone} />
      </div>
      {hint ? <div className="mt-0.5 text-xs text-ink-faint">{hint}</div> : null}
    </div>
  );
}
