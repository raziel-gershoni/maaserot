'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import TelegramAuth from '@/components/TelegramAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('auth');
  const tc = useTranslations('common');

  // Detect Telegram Mini App environment
  useEffect(() => {
    if (window.Telegram?.WebApp?.initData) {
      setIsTelegram(true);
    }
  }, []);

  // Check for error in URL params (from NextAuth redirect)
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'email_not_verified') {
      setError('Please verify your email before logging in');
    } else if (errorParam === 'account_locked') {
      setError('Your account is locked. Please try again later');
    } else if (errorParam === 'CredentialsSignin') {
      setError('Invalid email or password');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Check account status to get specific error message
        const statusResponse = await fetch('/api/auth/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (statusResponse.ok) {
          const data = await statusResponse.json();
          setError(data.message || 'Invalid email or password');
        } else {
          setError('Invalid email or password');
        }
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // If running inside Telegram, show TelegramAuth instead of login form
  if (isTelegram) {
    return <TelegramAuth />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{tc('appName')}</h1>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Login Card */}
      <div className="flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{t('login')}</h2>
          </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-3 rounded-lg border border-red-200 dark:border-red-700">
              <p>{error}</p>
              {(error.includes('verify') || searchParams.get('error') === 'email_not_verified') && (
                <div className="mt-2">
                  <Link
                    href={`/verify-email?email=${encodeURIComponent(email || searchParams.get('email') || '')}`}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-semibold underline"
                  >
                    לחץ כאן לאימות האימייל שלך
                  </Link>
                </div>
              )}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('email')}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent text-lg"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('password')}
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent text-lg"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg font-bold text-lg shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('loading') : t('signIn')}
            </button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {t('orLoginWith')}
              </span>
            </div>
          </div>

          {/* Telegram Login */}
          <div>
            <a
              href="/api/auth/telegram-login"
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#2AABEE] hover:bg-[#229ED9] text-white rounded-lg font-bold text-lg shadow-md transition"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              {t('loginWithTelegram')}
            </a>
          </div>

          <div className="text-center text-sm">
            <span className="text-gray-700 dark:text-gray-300">{t('noAccount')} </span>
            <Link href="/register" className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-semibold">
              {t('signUp')}
            </Link>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
