'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Spinner } from '@/components/ui';

/**
 * First visit with no locale cookie: the saved preference wins, which can mean
 * flipping the document from LTR to RTL after first paint.
 *
 * The flip itself is unavoidable — the direction is a server-rendered
 * attribute. What is avoidable is watching it happen, so the swap is covered
 * by a canvas-coloured screen with an announced loading state, and the scrim
 * disappears with the remount that lands on the new locale.
 */
export default function LocaleSync() {
  const router = useRouter();
  const t = useTranslations('common');
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const syncLocale = async () => {
      // Check if locale cookie already exists
      const cookies = document.cookie.split(';');
      const localeCookie = cookies.find((c) => c.trim().startsWith('NEXT_LOCALE='));

      // If cookie doesn't exist, fetch user's locale from database and set it
      if (!localeCookie) {
        try {
          const response = await fetch('/api/settings');
          if (response.ok) {
            const data = await response.json();
            const userLocale = data.settings.locale;

            // Set cookie
            document.cookie = `NEXT_LOCALE=${userLocale}; path=/; max-age=31536000`;

            // Navigate to correct locale without full page reload
            const currentLocale = window.location.pathname.split('/')[1];
            if (currentLocale !== userLocale) {
              if (cancelled) return;
              setSwitching(true);
              const newPath = window.location.pathname.replace(
                `/${currentLocale}`,
                `/${userLocale}`
              );
              router.replace(newPath);
            }
          }
        } catch (error) {
          console.error('Failed to sync locale:', error);
        }
      }
    };

    syncLocale();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!switching) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas animate-fade-in">
      <Spinner size="lg" label={t('loading')} className="text-brand" />
    </div>
  );
}
