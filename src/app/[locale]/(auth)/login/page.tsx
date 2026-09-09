'use client';

import { Suspense, useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import TelegramAuth from '@/components/TelegramAuth';
import {
  Alert,
  Button,
  buttonStyles,
  Card,
  Field,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { isErrorCode, translateApiError, type ErrorCode } from '@/lib/errorCodes';

/**
 * Bridge for the shapes that reach this screen from outside the error-code
 * contract: NextAuth's own error type names and the snake_case statuses the
 * status endpoint has always returned. Anything already a stable code passes
 * straight through, so this keeps working as the API migrates.
 */
const LEGACY_AUTH_ERRORS: Record<string, ErrorCode> = {
  email_not_verified: 'EMAIL_NOT_VERIFIED',
  emailnotverified: 'EMAIL_NOT_VERIFIED',
  account_locked: 'ACCOUNT_LOCKED',
  accountlocked: 'ACCOUNT_LOCKED',
  invalid_credentials: 'INVALID_CREDENTIALS',
  credentialssignin: 'INVALID_CREDENTIALS',
  callbackrouteerror: 'INVALID_CREDENTIALS',
  accessdenied: 'INVALID_CREDENTIALS',
};

function normalizeAuthError(value: unknown): ErrorCode | null {
  if (isErrorCode(value)) return value;
  if (typeof value !== 'string') return null;

  const key = value.trim().replace(/[\s-]+/g, '_');
  if (!key) return null;

  const upper = key.toUpperCase();
  if (isErrorCode(upper)) return upper;

  return LEGACY_AUTH_ERRORS[key.toLowerCase()] ?? null;
}

function LoginSkeleton() {
  return (
    <Card>
      <Skeleton className="h-8 w-40" />
      <div className="mt-6 space-y-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-13 w-full" />
      </div>
    </Card>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Holds whatever the auth layer handed back — a stable code when the API
  // provides one, a legacy string otherwise. Resolved at render time.
  const [errorValue, setErrorValue] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('auth');
  const te = useTranslations('errors');

  // Detect Telegram Mini App environment
  useEffect(() => {
    if (window.Telegram?.WebApp?.initData) {
      setIsTelegram(true);
    }
  }, []);

  // Check for error in URL params (from NextAuth redirect)
  useEffect(() => {
    const code = normalizeAuthError(searchParams.get('error'));
    if (code) {
      setErrorValue(code);
    }
  }, [searchParams]);

  const errorCode = errorValue === null ? null : normalizeAuthError(errorValue);
  const needsVerification = errorCode === 'EMAIL_NOT_VERIFIED';
  const verifyEmailAddress = email || searchParams.get('email') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorValue(null);
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      // `error` still gates the failure path, exactly as before. `code` is
      // where NextAuth carries a stable reason when the provider supplies one,
      // so prefer it — but only once `error` says something went wrong.
      const outcome = result as unknown as
        | { error?: string | null; code?: string | null }
        | null
        | undefined;
      const signInError = outcome?.error
        ? outcome.code || outcome.error
        : null;

      if (signInError) {
        if (isErrorCode(signInError)) {
          // The auth layer already speaks the error-code contract.
          setErrorValue(signInError);
        } else {
          // Legacy NextAuth error type — ask the status endpoint what actually
          // happened so a locked or unverified account is not reported as bad
          // credentials.
          const statusResponse = await fetch('/api/auth/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });

          if (statusResponse.ok) {
            const data = await statusResponse.json();
            const raw = data?.error ?? data?.code ?? data?.status;
            setErrorValue(
              typeof raw === 'string' && raw ? raw : 'INVALID_CREDENTIALS'
            );
          } else {
            setErrorValue('INVALID_CREDENTIALS');
          }
        }
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setErrorValue('SERVER_ERROR');
    } finally {
      setIsLoading(false);
    }
  };

  // If running inside Telegram, show TelegramAuth instead of login form
  if (isTelegram) {
    return <TelegramAuth />;
  }

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
      />

      <Card>
        <PageHeader title={t('login')} description={t('loginSubtitle')} />

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {errorValue !== null && (
            <Alert
              tone="error"
              action={
                needsVerification ? (
                  <Link
                    href={`/verify-email?email=${encodeURIComponent(verifyEmailAddress)}`}
                    className={buttonStyles({
                      variant: 'secondary',
                      size: 'sm',
                    })}
                  >
                    {t('verifyEmailCta')}
                  </Link>
                ) : undefined
              }
            >
              {translateApiError(te, errorCode)}
            </Alert>
          )}

          <div className="space-y-4">
            <Field
              id="email"
              name="email"
              label={t('email')}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              id="password"
              name="password"
              label={t('password')}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            pending={isLoading}
            pendingLabel={t('loading')}
          >
            {t('signIn')}
          </Button>

          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
            <span className="text-eyebrow uppercase text-ink-faint">
              {t('orLoginWith')}
            </span>
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </div>

          {/* Telegram's own brand mark — the one non-brand colour on the page. */}
          {/* Must be a real navigation, not a client transition: this route
              answers with a server redirect to Telegram's OAuth screen, which
              next/link cannot follow. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/auth/telegram-login"
            className={buttonStyles({
              size: 'lg',
              fullWidth: true,
              className: 'bg-[#2AABEE] text-white hover:bg-[#229ED9]',
            })}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="h-5 w-5 shrink-0 rtl:rotate-180"
            >
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
            {t('loginWithTelegram')}
          </a>

          <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-ink-muted">
            <span>{t('noAccount')}</span>
            <Link
              href="/register"
              className="font-semibold text-brand hover:text-brand-hover"
            >
              {t('signUp')}
            </Link>
          </p>
        </form>
      </Card>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
