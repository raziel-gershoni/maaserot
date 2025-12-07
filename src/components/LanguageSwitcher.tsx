'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { useTransition, useState } from 'react';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);

  const switchLocale = async (newLocale: 'he' | 'en') => {
    setIsSaving(true);

    // Set cookie for middleware to use
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`; // 1 year

    // Save language preference to database
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: newLocale }),
      });
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }

    // Switch language in UI
    startTransition(() => {
      router.replace(pathname, { locale: newLocale });
    });

    setIsSaving(false);
  };

  return (
    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 relative">
      {isSaving && (
        <div className="absolute inset-0 bg-gray-100/50 dark:bg-gray-700/50 rounded-lg flex items-center justify-center">
          <svg className="animate-spin h-4 w-4 text-gray-600 dark:text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      )}
      <button
        onClick={() => switchLocale('he')}
        disabled={isPending || isSaving || locale === 'he'}
        className={`px-3 py-1 rounded-md text-sm font-medium transition ${
          locale === 'he'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        } disabled:opacity-50`}
      >
        עב
      </button>
      <button
        onClick={() => switchLocale('en')}
        disabled={isPending || isSaving || locale === 'en'}
        className={`px-3 py-1 rounded-md text-sm font-medium transition ${
          locale === 'en'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        } disabled:opacity-50`}
      >
        EN
      </button>
    </div>
  );
}
