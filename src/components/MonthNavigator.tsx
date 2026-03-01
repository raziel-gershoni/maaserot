'use client';

import { useRouter, usePathname } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { getPreviousMonth, getNextMonth } from '@/lib/calculations';

interface MonthNavigatorProps {
  currentMonth: string;
  maxMonth: string;
  formattedMonth: string;
  locale: string;
  translations: {
    previousMonth: string;
    nextMonth: string;
  };
}

export default function MonthNavigator({
  currentMonth,
  maxMonth,
  formattedMonth,
  locale,
  translations,
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
    <div className="flex items-center justify-center gap-4 mb-6">
      <button
        onClick={() => navigateToMonth(getPreviousMonth(currentMonth))}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label={translations.previousMonth}
      >
        <svg
          className="w-6 h-6 text-gray-600 dark:text-gray-300 rtl:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <h2 className="text-xl font-semibold text-gray-900 dark:text-white min-w-[200px] text-center">
        {formattedMonth}
      </h2>

      <button
        onClick={() => navigateToMonth(getNextMonth(currentMonth))}
        disabled={isAtMax}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={translations.nextMonth}
      >
        <svg
          className="w-6 h-6 text-gray-600 dark:text-gray-300 rtl:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
