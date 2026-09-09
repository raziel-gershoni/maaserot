'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Dialog,
  Field,
  PageHeader,
  SectionRule,
  SelectField,
  Skeleton,
  SkeletonRows,
} from '@/components/ui';
import { translateApiError } from '@/lib/errorCodes';

/** The single source of truth for the password rule on this screen. */
const MIN_PASSWORD_LENGTH = 8;

interface UserSettings {
  name: string;
  email: string;
  defaultPercent: number;
  locale: string;
}

type PasswordIssue = 'mismatch' | 'tooShort' | null;

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    name: '',
    email: '',
    defaultPercent: 10,
    locale: 'he',
  });
  const [originalSettings, setOriginalSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordIssue, setPasswordIssue] = useState<PasswordIssue>(null);

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const locale = useLocale();
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');

  useEffect(() => {
    fetchSettings();
  // Mount-only fetch. The fetcher closes over next-intl's `t`, which is not
  // guaranteed to be referentially stable, so listing it here would re-run the
  // request on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const response = await fetch('/api/settings');

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setLoadError(translateApiError(tErrors, data.error));
        return;
      }

      const data = await response.json();
      setSettings(data.settings);
      setOriginalSettings(data.settings);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setLoadError(translateApiError(tErrors, null));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsSaving(true);

    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(translateApiError(tErrors, data.error));
        setIsSaving(false);
        return;
      }

      setSuccess(true);
      setOriginalSettings(settings);

      // Reload page if locale changed to apply new language.
      // The cookie has to move too: localeMiddleware redirects any URL whose
      // locale segment disagrees with NEXT_LOCALE, so navigating without
      // updating it just bounces straight back to the old language.
      if (settings.locale !== originalSettings?.locale) {
        document.cookie = `NEXT_LOCALE=${settings.locale}; path=/; max-age=31536000`;
        setTimeout(() => {
          window.location.href = `/${settings.locale}/settings`;
        }, 1000);
      } else {
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setError(t('errorOccurred'));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordIssue(null);
    setPasswordSuccess(false);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordIssue('mismatch');
      return;
    }

    if (passwordForm.newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordIssue('tooShort');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setPasswordError(translateApiError(tErrors, data.error));
        setPasswordLoading(false);
        return;
      }

      setPasswordSuccess(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch {
      setPasswordError(t('errorOccurred'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutError('');
    setIsLoggingOut(true);

    try {
      // localePrefix is 'always': an unprefixed /login 404s.
      await signOut({ callbackUrl: `/${locale}/login` });
    } catch {
      setLogoutError(translateApiError(tErrors, null));
      setIsLoggingOut(false);
    }
  };

  const percentValid =
    Number.isInteger(settings.defaultPercent) &&
    settings.defaultPercent >= 1 &&
    settings.defaultPercent <= 100;

  const hasChanges = originalSettings && (
    settings.name !== originalSettings.name ||
    settings.defaultPercent !== originalSettings.defaultPercent ||
    settings.locale !== originalSettings.locale
  );

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <div className="mx-auto w-full max-w-3xl">
          <PageHeader title={t('title')} description={t('subtitle')} />
          <div className="mt-6 space-y-5 sm:space-y-6">
            <Card>
              <Skeleton className="h-6 w-32" />
              <SkeletonRows rows={4} className="mt-5" />
            </Card>
            <Card>
              <Skeleton className="h-6 w-40" />
              <SkeletonRows rows={3} className="mt-5" />
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 md:p-8">
        <div className="mx-auto w-full max-w-3xl">
          <PageHeader title={t('title')} description={t('subtitle')} />
          <Alert
            tone="error"
            title={t('loadFailed')}
            className="mt-6"
            action={
              <Button variant="secondary" size="sm" onClick={fetchSettings}>
                {tCommon('retry')}
              </Button>
            }
          >
            {loadError}
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title={t('title')} description={t('subtitle')} />

        <div className="mt-6 space-y-5 sm:space-y-6">
          {/* Profile */}
          <Card>
            <CardHeader title={t('profile')} />

            <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              {success ? (
                <Alert tone="success">{t('saveSuccess')}</Alert>
              ) : null}

              {error ? (
                <Alert tone="error" title={t('saveFailed')}>
                  {error}
                </Alert>
              ) : null}

              <Field
                id="name"
                label={t('name')}
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                placeholder={t('namePlaceholder')}
                autoComplete="name"
              />

              <div>
                <div className="mb-1.5 text-sm font-semibold text-ink">
                  {t('email')}
                </div>
                <div className="rounded-control border border-line bg-surface-sunken px-3 py-2.5">
                  <span className="bidi-isolate block break-all text-sm text-ink-muted">
                    {settings.email}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-ink-faint">
                  {t('emailCannotChange')}
                </p>
              </div>

              <SectionRule>{t('preferences')}</SectionRule>

              <Field
                id="defaultPercent"
                label={t('defaultPercentage')}
                affix="%"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                value={Number.isNaN(settings.defaultPercent) ? '' : settings.defaultPercent}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultPercent: parseInt(e.target.value, 10),
                  })
                }
                hint={t('defaultPercentageHelp')}
                error={percentValid ? undefined : t('percentRange')}
              />

              <SelectField
                id="locale"
                label={t('language')}
                value={settings.locale}
                onChange={(e) => setSettings({ ...settings, locale: e.target.value })}
                hint={t('languageHelp')}
              >
                <option value="he">עברית (Hebrew)</option>
                <option value="en">English</option>
              </SelectField>

              <Button
                type="submit"
                size="lg"
                fullWidth
                pending={isSaving}
                pendingLabel={t('saving')}
                disabled={isSaving || success || !hasChanges || !percentValid}
              >
                {tCommon('save')}
              </Button>
            </form>
          </Card>

          {/* Password */}
          <Card>
            <CardHeader title={t('changePassword')} />

            <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-5">
              {passwordSuccess ? (
                <Alert tone="success">{t('passwordChangeSuccess')}</Alert>
              ) : null}

              {passwordError ? (
                <Alert tone="error" title={t('passwordChangeFailed')}>
                  {passwordError}
                </Alert>
              ) : null}

              <Field
                id="currentPassword"
                label={t('currentPassword')}
                type="password"
                required
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(e) => {
                  setPasswordForm({ ...passwordForm, currentPassword: e.target.value });
                  setPasswordError('');
                }}
              />

              <Field
                id="newPassword"
                label={t('newPassword')}
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                hint={t('passwordMinLength', { count: MIN_PASSWORD_LENGTH })}
                error={passwordIssue === 'tooShort' ? t('passwordTooShort') : undefined}
                value={passwordForm.newPassword}
                onChange={(e) => {
                  setPasswordForm({ ...passwordForm, newPassword: e.target.value });
                  setPasswordIssue(null);
                }}
              />

              <Field
                id="confirmPassword"
                label={t('confirmPassword')}
                type="password"
                required
                autoComplete="new-password"
                error={passwordIssue === 'mismatch' ? t('passwordMismatch') : undefined}
                value={passwordForm.confirmPassword}
                onChange={(e) => {
                  setPasswordForm({ ...passwordForm, confirmPassword: e.target.value });
                  setPasswordIssue(null);
                }}
              />

              <Button
                type="submit"
                size="lg"
                fullWidth
                pending={passwordLoading}
                pendingLabel={t('changing')}
                disabled={passwordLoading || passwordSuccess}
              >
                {t('changePassword')}
              </Button>
            </form>
          </Card>

          {/* Session */}
          <Card>
            <CardHeader
              title={t('accountActions')}
              description={t('sessionDescription')}
            />

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="danger"
                onClick={() => {
                  setLogoutError('');
                  setLogoutOpen(true);
                }}
                startSlot={
                  <svg
                    className="h-5 w-5 rtl:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                }
              >
                {t('logout')}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={logoutOpen}
        onClose={() => {
          if (!isLoggingOut) setLogoutOpen(false);
        }}
        title={t('logoutConfirmTitle')}
        size="sm"
        closeLabel={tCommon('close')}
        footer={
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={isLoggingOut}
              onClick={() => setLogoutOpen(false)}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="dangerSolid"
              className="flex-1"
              pending={isLoggingOut}
              pendingLabel={t('loggingOut')}
              onClick={handleLogout}
            >
              {t('logout')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-muted">
            {t('logoutConfirmDescription')}
          </p>
          {logoutError ? <Alert tone="error">{logoutError}</Alert> : null}
        </div>
      </Dialog>
    </div>
  );
}
