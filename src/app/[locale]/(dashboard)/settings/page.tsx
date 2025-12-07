'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface UserSettings {
  name: string;
  email: string;
  defaultPercent: number;
  locale: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    name: '',
    email: '',
    defaultPercent: 10,
    locale: 'he',
  });
  const [originalSettings, setOriginalSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const t = useTranslations('settings');
  const tCommon = useTranslations('common');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
        setOriginalSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
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
        const data = await response.json();
        setError(data.error || t('saveFailed'));
        setIsSaving(false);
        return;
      }

      setSuccess(true);
      setOriginalSettings(settings);

      // Reload page if locale changed to apply new language
      if (settings.locale !== originalSettings?.locale) {
        setTimeout(() => {
          window.location.href = `/${settings.locale}/settings`;
        }, 1000);
      } else {
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (error) {
      setError(t('errorOccurred'));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(t('passwordMismatch'));
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError(t('passwordTooShort'));
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
        const data = await response.json();
        setPasswordError(data.error || t('passwordChangeFailed'));
        setPasswordLoading(false);
        return;
      }

      setPasswordSuccess(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (error) {
      setPasswordError(t('errorOccurred'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const hasChanges = originalSettings && (
    settings.name !== originalSettings.name ||
    settings.defaultPercent !== originalSettings.defaultPercent ||
    settings.locale !== originalSettings.locale
  );

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600 dark:text-gray-400">{tCommon('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{t('title')}</h1>
          <p className="text-gray-700 dark:text-gray-300">{t('subtitle')}</p>
        </div>

        {/* Profile Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('profile')}</h2>

          {success && (
            <div className="bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-4 rounded-lg mb-4 border border-green-200 dark:border-green-700">
              ✓ {t('saveSuccess')}
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-4 rounded-lg mb-4 border border-red-200 dark:border-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('name')}
              </label>
              <input
                id="name"
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                placeholder={t('namePlaceholder')}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-lg"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('email')}
              </label>
              <input
                id="email"
                type="email"
                value={settings.email}
                disabled
                className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-lg cursor-not-allowed"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('emailCannotChange')}</p>
            </div>

            <div>
              <label htmlFor="defaultPercent" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('defaultPercentage')} (%)
              </label>
              <input
                id="defaultPercent"
                type="number"
                min="1"
                max="100"
                value={settings.defaultPercent}
                onChange={(e) => setSettings({ ...settings, defaultPercent: parseInt(e.target.value) })}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-lg"
              />
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t('defaultPercentageHelp')}</p>
            </div>

            <div>
              <label htmlFor="locale" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('language')}
              </label>
              <select
                id="locale"
                value={settings.locale}
                onChange={(e) => setSettings({ ...settings, locale: e.target.value })}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-lg"
              >
                <option value="he">עברית (Hebrew)</option>
                <option value="en">English</option>
              </select>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t('languageHelp')}</p>
            </div>

            <button
              type="submit"
              disabled={isSaving || success || !hasChanges}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-lg font-bold text-lg shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? t('saving') : success ? `✓ ${t('saved')}` : tCommon('save')}
            </button>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('changePassword')}</h2>

          {passwordSuccess && (
            <div className="bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-4 rounded-lg mb-4 border border-green-200 dark:border-green-700">
              ✓ {t('passwordChangeSuccess')}
            </div>
          )}

          {passwordError && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-4 rounded-lg mb-4 border border-red-200 dark:border-red-700">
              {passwordError}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('currentPassword')}
              </label>
              <input
                id="currentPassword"
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-lg"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('newPassword')}
              </label>
              <input
                id="newPassword"
                type="password"
                required
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-lg"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-lg"
              />
            </div>

            <button
              type="submit"
              disabled={passwordLoading || passwordSuccess}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-lg font-bold text-lg shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {passwordLoading ? t('changing') : passwordSuccess ? `✓ ${t('changed')}` : t('changePassword')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
