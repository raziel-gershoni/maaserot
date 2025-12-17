'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function VerifyTokenPage() {
  const params = useParams();
  const token = params.token as string;
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const t = useTranslations('auth');
  const tc = useTranslations('common');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Invalid verification link');
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await fetch(`/api/auth/verify-email?token=${token}`);
        const data = await response.json();

        if (!response.ok) {
          setStatus('error');
          setError(data.error || 'Verification failed');
          return;
        }

        setStatus('success');
        setEmail(data.email || '');
      } catch (error) {
        setStatus('error');
        setError('An error occurred during verification');
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{tc('appName')}</h1>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Verification Result */}
      <div className="flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          {status === 'loading' && (
            <div className="text-center">
              {/* Loading Spinner */}
              <div className="mx-auto w-16 h-16 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mb-4"></div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">מאמת את האימייל שלך...</h2>
              <p className="text-gray-600 dark:text-gray-400">אנא המתן רגע</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              {/* Success Icon */}
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">אימות הצליח!</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                האימייל שלך אומת בהצלחה.
              </p>
              {email && (
                <p className="text-green-600 dark:text-green-400 font-semibold mb-6">
                  {email}
                </p>
              )}
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-8">
                עכשיו תוכל להתחבר ולהתחיל להשתמש במערכת.
              </p>
              <Link
                href="/login"
                className="inline-block w-full py-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg font-bold text-lg shadow-md transition"
              >
                התחבר למערכת
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              {/* Error Icon */}
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">האימות נכשל</h2>
              <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-4 rounded-lg border border-red-200 dark:border-red-700 mb-6">
                {error}
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-8">
                הקישור עשוי להיות לא תקף או שפג תוקפו.
              </p>
              <div className="space-y-3">
                <Link
                  href="/verify-email"
                  className="inline-block w-full py-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg font-bold shadow-md transition"
                >
                  שלח שוב קישור אימות
                </Link>
                <Link
                  href="/login"
                  className="inline-block w-full py-3 bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white rounded-lg font-bold shadow-md transition"
                >
                  חזרה להתחברות
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
