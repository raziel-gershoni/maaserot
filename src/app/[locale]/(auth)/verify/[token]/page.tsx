'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { Alert, buttonStyles, Card, Spinner } from '@/components/ui';
import { isErrorCode, translateApiError, type ErrorCode } from '@/lib/errorCodes';

/**
 * One heading treatment for all three states, so the card does not resize
 * under the reader when verification resolves.
 */
const HEADING = 'font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl';

/**
 * Bridge for the prose the verification route still returns. A stable code
 * passes straight through, so this keeps working once that route is migrated.
 */
function resolveTokenError(value: unknown): ErrorCode {
  if (isErrorCode(value)) return value;

  if (typeof value === 'string') {
    const message = value.toLowerCase();
    if (message.includes('expire')) return 'TOKEN_EXPIRED';
    if (message.includes('not found')) return 'USER_NOT_FOUND';
    if (message.includes('invalid') || message.includes('token')) {
      return 'TOKEN_INVALID';
    }
  }

  return 'SERVER_ERROR';
}

export default function VerifyTokenPage() {
  const params = useParams();
  const token = params.token as string;
  const isValidToken = useMemo(() => !!token, [token]);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    isValidToken ? 'loading' : 'error'
  );
  const [errorCode, setErrorCode] = useState<ErrorCode>('TOKEN_INVALID');
  const [email, setEmail] = useState('');
  const t = useTranslations('auth');
  const te = useTranslations('errors');

  useEffect(() => {
    if (!isValidToken) {
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await fetch(`/api/auth/verify-email?token=${token}`);
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          setStatus('error');
          setErrorCode(resolveTokenError(data?.error ?? data?.code));
          return;
        }

        setStatus('success');
        setEmail(data?.email || '');
      } catch {
        setStatus('error');
        setErrorCode('SERVER_ERROR');
      }
    };

    verifyEmail();
  }, [token, isValidToken]);

  return (
    <Card>
      {status === 'loading' && (
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Spinner size="lg" />
          </span>
          <h1 className={`mt-4 ${HEADING}`}>{t('verifying')}</h1>
          <p className="mt-2 text-sm text-ink-muted">{t('verifyingHint')}</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-positive-soft text-positive"
          >
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <h1 className={`mt-4 ${HEADING}`}>{t('verifiedTitle')}</h1>
          {email && (
            <p className="bidi-isolate mt-2 break-all font-semibold text-ink">
              {email}
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            {t('verifiedBody')}
          </p>
          <Link
            href="/login"
            className={buttonStyles({
              variant: 'primary',
              size: 'lg',
              fullWidth: true,
              className: 'mt-6',
            })}
          >
            {t('signIn')}
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-critical-soft text-critical"
          >
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
          <h1 className={`mt-4 ${HEADING}`}>{t('verifyFailedTitle')}</h1>

          <Alert tone="error" className="mt-4 w-full text-start">
            {translateApiError(te, errorCode)}
          </Alert>

          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            {t('verifyFailedBody')}
          </p>

          <div className="mt-6 w-full space-y-3">
            <Link
              href="/verify-email"
              className={buttonStyles({
                variant: 'primary',
                size: 'lg',
                fullWidth: true,
              })}
            >
              {t('resendVerification')}
            </Link>
            <Link
              href="/login"
              className={buttonStyles({
                variant: 'secondary',
                size: 'lg',
                fullWidth: true,
              })}
            >
              {t('backToLogin')}
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
