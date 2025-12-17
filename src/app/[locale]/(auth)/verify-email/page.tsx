'use client';

import { useState, useEffect, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import LanguageSwitcher from '@/components/LanguageSwitcher';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email');
  const [email, setEmail] = useState(emailParam || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const t = useTranslations('auth');
  const tc = useTranslations('common');

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
      setError('Please enter your email address');
      return;
    }

    setError('');
    setMessage('');
    setIsLoading(true);
    setCanResend(false);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to resend verification email');
        setCanResend(true);
        setIsLoading(false);
        return;
      }

      setMessage('Verification email sent! Please check your inbox.');
      setCountdown(60); // 60 second cooldown
    } catch (error) {
      setError('An error occurred while sending the email');
      setCanResend(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{tc('appName')}</h1>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Verification Instructions */}
      <div className="flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="text-center">
            {/* Email Icon */}
            <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">בדוק את האימייל שלך</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              שלחנו קישור לאימות לכתובת:
            </p>
            {email && (
              <p className="text-blue-600 dark:text-blue-400 font-semibold mb-6">
                {email}
              </p>
            )}
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              לחץ על הקישור באימייל כדי לאמת את החשבון שלך ולהתחיל להשתמש במערכת.
            </p>
          </div>

          {message && (
            <div className="bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-3 rounded-lg border border-green-200 dark:border-green-700 text-center">
              {message}
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-3 rounded-lg border border-red-200 dark:border-red-700 text-center">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Resend Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-4">
                לא קיבלת את האימייל?
              </p>

              {!emailParam && (
                <div className="mb-4">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="הכנס את כתובת האימייל שלך"
                    className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
              )}

              <button
                onClick={handleResend}
                disabled={isLoading || !canResend}
                className="w-full py-3 bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white rounded-lg font-bold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'שולח...' : canResend ? 'שלח שוב' : `המתן ${countdown} שניות`}
              </button>
            </div>

            {/* Tips */}
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">טיפים:</p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                <li>בדוק את תיקיית הספאם או הזבל</li>
                <li>הקישור תקף ל-24 שעות</li>
                <li>ודא שהכתובת נכונה</li>
              </ul>
            </div>

            {/* Back to Login */}
            <div className="text-center text-sm border-t border-gray-200 dark:border-gray-700 pt-4">
              <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-semibold">
                חזרה להתחברות
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-gray-900" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
