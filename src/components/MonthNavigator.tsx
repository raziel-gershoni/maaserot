'use client';

import { useRouter, usePathname } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { getPreviousMonth, getNextMonth } from '@/lib/calculations';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface MonthNavigatorProps {
  currentMonth: string;
  maxMonth: string;
  formattedMonth: string;
  locale: string;
  translations: {
    previousMonth: string;
    nextMonth: string;
    currentMonth: string;
  };
  /** Optional wrapper classes. Defaults to the original bottom margin. */
  className?: string;
}

/**
 * Moves the `?month=` param on whatever page it sits on — the dashboard and
 * the income page share it, so it must stay route-agnostic.
 */
export default function MonthNavigator({
  currentMonth,
  maxMonth,
  formattedMonth,
  translations,
  className,
}: MonthNavigatorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAtMax = currentMonth >= maxMonth;

  const navigateToMonth = (month: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (month === maxMonth) {
      params.delete('month');
    } else {
      params.set('month', month);
    }
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ''}` as never);
  };

  return (
    <div
      className={cn(
        'mb-6 flex flex-wrap items-center justify-center gap-2',
        className
      )}
    >
      <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-card">
        <Button
          variant="ghost"
          icon
          className="rounded-full"
          onClick={() => navigateToMonth(getPreviousMonth(currentMonth))}
          aria-label={translations.previousMonth}
        >
          <svg
            className="h-5 w-5 rtl:rotate-180"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </Button>

        {/* No fixed width: a long month name in either language sets its own. */}
        <h2 className="min-w-0 px-2 text-center font-display text-base font-semibold text-ink sm:text-lg">
          {formattedMonth}
        </h2>

        <Button
          variant="ghost"
          icon
          className="rounded-full"
          onClick={() => navigateToMonth(getNextMonth(currentMonth))}
          disabled={isAtMax}
          aria-label={translations.nextMonth}
        >
          <svg
            className="h-5 w-5 rtl:rotate-180"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Button>
      </div>

      {!isAtMax && (
        <Button
          variant="secondary"
          size="sm"
          className="ms-2"
          onClick={() => navigateToMonth(maxMonth)}
        >
          {translations.currentMonth}
        </Button>
      )}
    </div>
  );
}
