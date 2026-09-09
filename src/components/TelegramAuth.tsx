'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Alert, Button, Card, Spinner } from '@/components/ui';

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
 *
 * `idle` renders the same waiting panel as `authenticating`: the login page
 * swaps its form out the moment it detects Telegram, so returning null here
 * left the viewer on a blank screen for the length of the handoff.
 */
export default function TelegramAuth() {
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'error'>('idle');
  const router = useRouter();
  const attempted = useRef(false);
  const t = useTranslations('auth');
  const tc = useTranslations('common');

  const authenticate = useCallback(() => {
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

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    // Reads window.Telegram and starts the sign-in handshake on mount, which
    // cannot happen during render. Guarded to one attempt by the ref above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    authenticate();
  }, [authenticate]);

  if (status === 'error') {
    return (
      <Card>
        <Alert tone="error" title={t('telegramFailedTitle')}>
          {t('telegramFailedBody')}
        </Alert>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={authenticate}
          >
            {tc('retry')}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => window.Telegram?.WebApp.close()}
          >
            {tc('close')}
          </Button>
        </div>
      </Card>
    );
  }

  // `idle` and `authenticating` share one panel — from the viewer's side both
  // are the same moment of waiting.
  return (
    <Card>
      <div className="flex flex-col items-center py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Spinner size="lg" />
        </span>
        <p className="mt-4 font-display text-lg font-semibold text-ink">
          {t('telegramConnecting')}
        </p>
      </div>
    </Card>
  );
}
