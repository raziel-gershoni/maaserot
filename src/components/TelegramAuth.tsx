'use client';

import { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from '@/i18n/routing';

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
        };
        ready: () => void;
        close: () => void;
        expand: () => void;
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
        };
        colorScheme: 'light' | 'dark';
        platform: string;
      };
    };
  }
}

/**
 * Detects if running inside Telegram Mini App and auto-authenticates.
 * Mount this in the login page or root layout.
 */
export default function TelegramAuth() {
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'error'>('idle');
  const router = useRouter();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const tg = window.Telegram?.WebApp;
    if (!tg?.initData) return; // Not inside Telegram

    // Signal to Telegram that the app is ready
    tg.ready();
    tg.expand();

    // Auto-authenticate with Telegram initData
    setStatus('authenticating');

    signIn('telegram', {
      initData: tg.initData,
      redirect: false,
    }).then((result) => {
      if (result?.error) {
        console.error('Telegram auth failed:', result.error);
        setStatus('error');
      } else {
        router.push('/');
        router.refresh();
      }
    }).catch((err) => {
      console.error('Telegram auth error:', err);
      setStatus('error');
    });
  }, [router]);

  if (status === 'authenticating') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Connecting via Telegram...
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center space-y-4 p-8">
          <p className="text-red-600 dark:text-red-400 text-lg">
            Telegram authentication failed. Please try again.
          </p>
          <button
            onClick={() => window.Telegram?.WebApp.close()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Not in Telegram or already authenticated — render nothing
  return null;
}
