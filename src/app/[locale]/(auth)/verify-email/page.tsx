'use client';

import { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Field,
  SectionRule,
  Skeleton,
} from '@/components/ui';
import { isErrorCode, translateApiError, type ErrorCode } from '@/lib/errorCodes';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Bridge for the prose the resend route still returns. A stable code passes
 * straight through, so this keeps working once that route is migrated.
 */
function resolveResendError(status: number, value: unknown): ErrorCode {
  if (isErrorCode(value)) return value;
  if (status === 429) return 'RATE_LIMITED';

  if (typeof value === 'string') {
    const message = value.toLowerCase();
    if (message.includes('not found')) return 'USER_NOT_FOUND';
    if (message.includes('validation')) return 'VALIDATION_FAILED';
  }

  return 'SERVER_ERROR';
}

type Feedback = { tone: 'success' | 'error' | 'info'; message: string } | null;

function VerifyEmailSkeleton() {
  return (
    <Card>
      <div className="flex flex-col items-center">
        <Skeleton className="h-14 w-14 rounded-full" />
        <Skeleton className="mt-4 h-8 w-52" />
        <Skeleton className="mt-3 h-4 w-64" />
      </div>
      <div className="mt-8 space-y-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </Card>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email');
  const [email, setEmail] = useState(emailParam || '');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const t = useTranslations('auth');
  const te = useTranslations('errors');

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && !canResend) {
      setCanResend(true);
    }
  }, [countdown, canResend]);

  const handleResend = async () => {
    if (!email) {
      setFeedback({ tone: 'error', message: t('emailRequired') });
      return;
    }

    setFeedback(null);
    setIsLoading(true);
    setCanResend(false);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const raw = data?.error ?? data?.code;

        // Already verified is not a failure — it is a shortcut to signing in.
        // The route signals it with a `reason` field alongside the code; it
        // no longer returns the English prose this used to match on.
        if (data?.reason === 'already_verified') {
          setFeedback({ tone: 'info', message: t('alreadyVerified') });
        } else {
          setFeedback({
            tone: 'error',
            message: translateApiError(
              te,
              resolveResendError(response.status, raw)
            ),
          });
        }

        setCanResend(true);
        setIsLoading(false);
        return;
      }

      setFeedback({ tone: 'success', message: t('resendSuccess') });
      setCountdown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setFeedback({ tone: 'error', message: translateApiError(te, 'SERVER_ERROR') });
      setCanResend(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand"
        >
          <svg
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </span>

        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {t('checkYourEmail')}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t('verificationSentTo')}</p>
        {email && (
          <p className="bidi-isolate mt-1 break-all font-semibold text-ink">
            {email}
          </p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {t('verificationInstructions')}
        </p>
      </div>

      {feedback && (
        <Alert tone={feedback.tone} className="mt-6">
          {feedback.message}
        </Alert>
      )}

      <div className="mt-7">
        <SectionRule>{t('didntGetEmail')}</SectionRule>

        <div className="mt-4 space-y-3">
          {!emailParam && (
            <Field
              id="resend-email"
              name="email"
              label={t('email')}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={handleResend}
            disabled={!canResend}
            pending={isLoading}
            pendingLabel={t('resending')}
          >
            {canResend ? t('resend') : t('resendIn', { seconds: countdown })}
          </Button>
        </div>
      </div>

      <div className="mt-7">
        <SectionRule>{t('tips')}</SectionRule>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
            <span>{t('tipSpam')}</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
            <span>{t('tipLinkExpiry')}</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
            <span>{t('tipCheckAddress')}</span>
          </li>
        </ul>
      </div>

      <p className="mt-7 text-center text-sm">
        <Link
          href="/login"
          className="font-semibold text-brand hover:text-brand-hover"
        >
          {t('backToLogin')}
        </Link>
      </p>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailSkeleton />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
