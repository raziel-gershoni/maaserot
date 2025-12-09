'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/calculations';

interface SharedAccess {
  id: string;
  owner: {
    name: string | null;
    email: string;
  };
  viewer: {
    name: string | null;
    email: string;
  };
  canEdit: boolean;
  createdAt: string;
}

interface CombinedSummary {
  totalMaaser: number;
  totalFixedCharities: number;
  unpaid: number;
}

export default function SharedPage() {
  const [email, setEmail] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [sharingWith, setSharingWith] = useState<SharedAccess[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedAccess[]>([]);
  const [combinedSummary, setCombinedSummary] = useState<CombinedSummary | null>(null);
  const [showCombined, setShowCombined] = useState(false);
  const [locale, setLocale] = useState('he');

  const t = useTranslations('shared');
  const tCommon = useTranslations('common');

  useEffect(() => {
    fetchSharedAccess();
    fetchLocale();
  }, []);

  const fetchLocale = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setLocale(data.settings.locale);
      }
    } catch (error) {
      console.error('Failed to fetch locale:', error);
    }
  };

  const fetchSharedAccess = async () => {
    try {
      const response = await fetch('/api/shared');
      if (response.ok) {
        const data = await response.json();
        setSharingWith(data.sharingWith || []);
        setSharedWithMe(data.sharedWithMe || []);
      }
    } catch (error) {
      console.error('Failed to fetch shared access:', error);
    }
  };

  const fetchCombinedSummary = async () => {
    try {
      const response = await fetch('/api/shared/summary');
      if (response.ok) {
        const data = await response.json();
        setCombinedSummary(data);
        setShowCombined(true);
      }
    } catch (error) {
      console.error('Failed to fetch combined summary:', error);
    }
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const response = await fetch('/api/shared', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, canEdit }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || t('shareFailed'));
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setEmail('');
      setCanEdit(false);
      fetchSharedAccess();
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      setError(t('errorOccurred'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    if (!confirm(t('revokeConfirm'))) return;

    try {
      const response = await fetch(`/api/shared?id=${shareId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchSharedAccess();
      }
    } catch (error) {
      console.error('Failed to revoke access:', error);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">{t('title')}</h1>
          <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">{t('subtitle')}</p>
        </div>

        {/* Share Access Form */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('shareAccess')}</h2>

          {success && (
            <div className="bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-4 rounded-lg mb-4 border border-green-200 dark:border-green-700">
              ✓ {t('shareSuccess')}
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-4 rounded-lg mb-4 border border-red-200 dark:border-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleShare} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('userEmail')}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-base"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                id="canEdit"
                type="checkbox"
                checked={canEdit}
                onChange={(e) => setCanEdit(e.target.checked)}
                className="w-5 h-5 rounded border-gray-400 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="canEdit" className="text-sm text-gray-900 dark:text-gray-100">
                {t('allowEdit')}
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading || success}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-lg font-bold text-base shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('sharing') : success ? `✓ ${t('shared')}` : t('share')}
            </button>
          </form>
        </div>

        {/* Combined Summary */}
        {sharedWithMe.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 mb-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{t('combinedSummary')}</h2>
              <button
                onClick={() => showCombined ? setShowCombined(false) : fetchCombinedSummary()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white rounded-lg font-medium text-sm transition"
              >
                {showCombined ? t('hide') : t('show')}
              </button>
            </div>

            {showCombined && combinedSummary && (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <p className="font-semibold text-gray-900 dark:text-white">{t('totalMaaser')}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatCurrency(combinedSummary.totalMaaser, locale)}
                  </p>
                </div>

                <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <p className="font-semibold text-gray-900 dark:text-white">{t('totalFixedCharities')}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatCurrency(combinedSummary.totalFixedCharities, locale)}
                  </p>
                </div>

                <div className="border-t-2 border-gray-300 dark:border-gray-600 pt-4 mt-4">
                  <div className="flex justify-between items-center p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-200 dark:border-indigo-700">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{t('unpaid')}</p>
                    <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
                      {formatCurrency(combinedSummary.unpaid, locale)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* People you're sharing with */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('sharingWith')}</h2>

          {sharingWith.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">{t('notSharingWithAnyone')}</p>
          ) : (
            <div className="space-y-3">
              {sharingWith.map((share) => (
                <div key={share.id} className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {share.viewer.name || share.viewer.email}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {share.canEdit ? t('canEdit') : t('viewOnly')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevoke(share.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition"
                  >
                    {t('revoke')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* People sharing with you */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('sharedWithYou')}</h2>

          {sharedWithMe.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">{t('noOneSharing')}</p>
          ) : (
            <div className="space-y-3">
              {sharedWithMe.map((share) => (
                <div key={share.id} className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {share.owner.name || share.owner.email}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {share.canEdit ? t('canEdit') : t('viewOnly')}
                    </p>
                  </div>
                  <a
                    href={`/shared/${share.owner.email}`}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition"
                  >
                    {t('view')}
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
