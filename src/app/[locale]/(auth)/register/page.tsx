'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { Alert, Button, Card, Field, PageHeader } from '@/components/ui';
import { isErrorCode, translateApiError, type ErrorCode } from '@/lib/errorCodes';

/** The registration flow enforces this everywhere: form, hint, error copy. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Bridge for the prose the register route still returns. A stable code passes
 * straight through, so this keeps working once that route is migrated.
 */
function resolveRegisterError(status: number, value: unknown): ErrorCode {
  if (isErrorCode(value)) return value;
  if (status === 429) return 'RATE_LIMITED';

  if (typeof value === 'string') {
    const message = value.toLowerCase();
    if (message.includes('exist')) return 'EMAIL_TAKEN';
    if (message.includes('validation')) return 'VALIDATION_FAILED';
  }

  return 'SERVER_ERROR';
}

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations('auth');
  const te = useTranslations('errors');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorCode(null);
    setPasswordError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(t('passwordTooShort'));
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setErrorCode(resolveRegisterError(response.status, data?.error ?? data?.code));
        setIsLoading(false);
        return;
      }

      // Redirect to verification page with email in URL
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch {
      setErrorCode('SERVER_ERROR');
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <PageHeader title={t('register')} description={t('registerSubtitle')} />

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        {errorCode !== null && (
          <Alert tone="error">{translateApiError(te, errorCode)}</Alert>
        )}

        <div className="space-y-4">
          <Field
            id="name"
            name="name"
            label={t('name')}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            hint={t('passwordHint')}
            error={passwordError || undefined}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError('');
            }}
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
          {t('signUp')}
        </Button>

        <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-ink-muted">
          <span>{t('alreadyHaveAccount')}</span>
          <Link
            href="/login"
            className="font-semibold text-brand hover:text-brand-hover"
          >
            {t('signIn')}
          </Link>
        </p>
      </form>
    </Card>
  );
}
