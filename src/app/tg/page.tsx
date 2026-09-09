'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Alert, Button, Card, Spinner } from '@/components/ui';

/**
 * Dedicated Telegram Mini App entry point.
 * Lives outside the locale routes so middleware doesn't redirect,
 * preserving the URL hash fragment with tgWebAppData.
 *
 * Configure BotFather Mini App URL: https://your-domain.com/tg
 *
 * This route has no NextIntlClientProvider — it is outside `[locale]` and the
 * viewer's language only arrives from Telegram at runtime — so the handful of
 * strings it needs live here, keyed by the negotiated language.
 */

const STRINGS = {
  he: {
    appName: 'מעשרות',
    tagline: 'המעשר החודשי שלך, מסודר',
    openingTitle: 'פותח את מעשרות',
    openingHint: 'רגע, בודקים את החיבור לטלגרם.',
    connectingTitle: 'מתחבר דרך טלגרם',
    connectingHint: 'מאמתים את החשבון שלך מול טלגרם.',
    errorTitle: 'ההתחברות דרך טלגרם נכשלה',
    errorBody: 'לא הצלחנו לאמת את החשבון מול טלגרם. אפשר לנסות שוב, או לסגור את היישומון ולפתוח אותו מחדש.',
    retry: 'נסה שוב',
    close: 'סגור',
    footnote: 'ההתחברות מתבצעת דרך חשבון הטלגרם שלך.',
  },
  en: {
    appName: 'Maaserot',
    tagline: 'Your monthly maaser, tracked',
    openingTitle: 'Opening Maaserot',
    openingHint: 'One moment — checking the Telegram connection.',
    connectingTitle: 'Connecting via Telegram',
    connectingHint: 'Verifying your account with Telegram.',
    errorTitle: 'Telegram sign-in failed',
    errorBody: 'We could not verify your account with Telegram. Try again, or close the mini app and open it once more.',
    retry: 'Try again',
    close: 'Close',
    footnote: 'You sign in with your Telegram account.',
  },
} as const;

type Lang = keyof typeof STRINGS;

/** Telegram sends ISO 639-1; older clients still send the legacy `iw`. */
function negotiateLang(code: string | undefined): Lang {
  const normalized = code?.toLowerCase() ?? '';
  // An absent code falls back to the app's default locale, not to English.
  // 'iw' is the legacy ISO code for Hebrew and some clients still send it.
  if (!normalized) return 'he';
  return normalized.startsWith('he') || normalized.startsWith('iw') ? 'he' : 'en';
}

/* --------------------------------------------------------------------------
   Telegram theme sync

   Telegram hands the Mini App the host client's palette. Without this the app
   styles itself off the OS, so a viewer running Telegram in dark mode on a
   light phone gets a light app inside a dark client. Every read is guarded:
   outside Telegram the API is simply absent and the normal theme stands.
   ------------------------------------------------------------------------ */

type ThemeParams = Record<string, string | undefined>;

type TelegramEventApi = {
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function asColor(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && HEX_COLOR.test(trimmed) ? trimmed : null;
}

/** `rgba()` rather than `color-mix()`: older Telegram webviews lack the latter,
 *  and an invalid custom property would blank the surface it feeds. */
function withAlpha(hex: string, alpha: number): string {
  let body = hex.slice(1);
  if (body.length === 3) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const n = Number.parseInt(body, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function applyTelegramTheme() {
  if (typeof document === 'undefined') return;
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  try {
    const root = document.documentElement;
    const params = (tg.themeParams ?? {}) as ThemeParams;

    const scheme = tg.colorScheme;
    if (scheme === 'dark' || scheme === 'light') {
      root.style.setProperty('color-scheme', scheme);
    }

    const bg = asColor(params.bg_color);
    const secondary = asColor(params.secondary_bg_color);
    const text = asColor(params.text_color);
    const hint = asColor(params.hint_color);
    const separator = asColor(params.section_separator_color);

    const set = (name: string, value: string | null) => {
      if (value) root.style.setProperty(name, value);
    };

    // Telegram's grouped-list convention: `bg_color` is the raised surface a
    // card sits on, `secondary_bg_color` the ground behind it.
    set('--canvas', secondary ?? bg);
    set('--surface', bg ?? secondary);
    set('--surface-sunken', secondary ?? bg);
    set('--ink', text);
    set('--ink-muted', hint ?? (text ? withAlpha(text, 0.66) : null));
    set('--line', separator ?? (hint ? withAlpha(hint, 0.24) : null));
  } catch {
    // A host that answers the API in an unexpected shape keeps the app theme.
  }
}

export default function TelegramEntryPage() {
  const [status, setStatus] = useState<'loading' | 'authenticating' | 'error'>('loading');
  const [lang, setLang] = useState<Lang>('he');
  const attempted = useRef(false);

  // Announce readiness, take the full viewport height, and match the host
  // client's theme — before anything about auth is known.
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    try {
      tg.ready();
      tg.expand();
    } catch {
      // Not fatal: an older client that lacks one of these still renders.
    }

    applyTelegramTheme();

    const events = tg as unknown as TelegramEventApi;
    const onThemeChanged = () => applyTelegramTheme();
    events.onEvent?.('themeChanged', onThemeChanged);
    return () => events.offEvent?.('themeChanged', onThemeChanged);
  }, []);

  // Follow the Telegram account's language for this screen and for the
  // document itself, so an English viewer is not handed an RTL document.
  useEffect(() => {
    const next = negotiateLang(
      window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code
    );
    // Reading the host client's locale is exactly the external-system sync an
    // effect is for; it cannot be done during render because window.Telegram
    // does not exist on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLang(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'he' ? 'rtl' : 'ltr';
  }, []);

  const authenticate = useCallback(() => {
    const tg = window.Telegram?.WebApp;

    if (!tg?.initData) {
      // Not inside Telegram — hand the viewer to the normal login flow.
      window.location.href = '/';
      return;
    }

    setStatus('authenticating');

    signIn('telegram', {
      initData: tg.initData,
      redirect: false,
    })
      .then((result) => {
        if (result?.error) {
          console.error('Telegram auth failed:', result.error);
          setStatus('error');
        } else {
          // Land in the locale the Telegram account already reads in.
          const locale = negotiateLang(
            tg.initDataUnsafe?.user?.language_code
          );
          window.location.href = `/${locale}`;
        }
      })
      .catch((err) => {
        console.error('Telegram auth error:', err);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    // Kicks off the Telegram handshake on mount and moves the state machine
    // out of 'loading'. Guarded to one attempt by the ref above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    authenticate();
  }, [authenticate]);

  const s = STRINGS[lang];
  const waiting =
    status === 'authenticating'
      ? { title: s.connectingTitle, hint: s.connectingHint }
      : { title: s.openingTitle, hint: s.openingHint };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/icon-192x192.png"
            alt=""
            width={192}
            height={192}
            priority
            className="h-16 w-16 rounded-card shadow-raised"
          />
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
            {s.appName}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{s.tagline}</p>
        </div>

        <Card className="mt-6">
          {status === 'error' ? (
            <>
              <Alert tone="error" title={s.errorTitle}>
                {s.errorBody}
              </Alert>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  className="min-w-32 flex-1"
                  onClick={authenticate}
                >
                  {s.retry}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-w-32 flex-1"
                  onClick={() => window.Telegram?.WebApp?.close()}
                >
                  {s.close}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Spinner size="lg" label={waiting.title} />
              </span>
              <p className="mt-4 font-display text-lg font-semibold text-ink">
                {waiting.title}
              </p>
              <p className="mt-1 text-sm text-ink-muted">{waiting.hint}</p>
            </div>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-ink-faint">{s.footnote}</p>
      </div>
    </main>
  );
}
