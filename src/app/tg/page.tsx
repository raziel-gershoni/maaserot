'use client';

import { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';

/**
 * Dedicated Telegram Mini App entry point.
 * Lives outside the locale routes so middleware doesn't redirect,
 * preserving the URL hash fragment with tgWebAppData.
 *
 * Configure BotFather Mini App URL: https://your-domain.com/tg
 */
export default function TelegramEntryPage() {
  const [status, setStatus] = useState<'loading' | 'authenticating' | 'error'>('loading');
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const tg = window.Telegram?.WebApp;

    if (!tg?.initData) {
      // Not inside Telegram — redirect to normal login
      window.location.href = '/';
      return;
    }

    tg.ready();
    tg.expand();

    setStatus('authenticating');

    signIn('telegram', {
      initData: tg.initData,
      redirect: false,
    }).then((result) => {
      if (result?.error) {
        console.error('Telegram auth failed:', result.error);
        setStatus('error');
      } else {
        // Redirect to dashboard
        window.location.href = '/he';
      }
    }).catch((err) => {
      console.error('Telegram auth error:', err);
      setStatus('error');
    });
  }, []);

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4 p-8">
          <p className="text-red-600 dark:text-red-400 text-lg">
            Telegram authentication failed. Please try again.
          </p>
          <button
            onClick={() => window.Telegram?.WebApp?.close()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          Connecting via Telegram...
        </p>
      </div>
    </div>
  );
}
