'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/routing';

export default function LocaleSync() {
  const router = useRouter();

  useEffect(() => {
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
  }, [router]);

  return null;
}
