'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

interface User {
  id: string;
  name: string | null;
  email: string;
}

interface Partnership {
  id: string;
  user1Id: string;
  user2Id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  initiatedBy: string;
  user1: User;
  user2: User;
  createdAt: string;
}

export default function PartnershipPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [currentPartnership, setCurrentPartnership] = useState<Partnership | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<Partnership[]>([]);
  const [sentInvitations, setSentInvitations] = useState<Partnership[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const t = useTranslations('partnership');
  const router = useRouter();

  useEffect(() => {
    fetchPartnerships();
  }, []);

  const fetchPartnerships = async () => {
    try {
      const response = await fetch('/api/partnership');
      if (response.ok) {
        const data = await response.json();
        setCurrentPartnership(data.currentPartnership || null);
        setPendingInvitations(data.pendingInvitations || []);
        setSentInvitations(data.sentInvitations || []);

        // Determine current user ID from the data
        if (data.currentPartnership) {
          // We can infer current user by checking who appears in both user positions
          // But easier: API should tell us. For now, check sentInvitations
          if (data.sentInvitations && data.sentInvitations.length > 0) {
            setCurrentUserId(data.sentInvitations[0].user1Id);
          } else if (data.pendingInvitations && data.pendingInvitations.length > 0) {
            setCurrentUserId(data.pendingInvitations[0].user2Id);
          } else if (data.currentPartnership) {
            // As fallback, we need to get it from settings API
            fetchCurrentUserId();
          }
        } else if (data.sentInvitations && data.sentInvitations.length > 0) {
          setCurrentUserId(data.sentInvitations[0].user1Id);
        } else if (data.pendingInvitations && data.pendingInvitations.length > 0) {
          setCurrentUserId(data.pendingInvitations[0].user2Id);
        } else {
          fetchCurrentUserId();
        }
      }
    } catch (error) {
      console.error('Failed to fetch partnerships:', error);
    }
  };

  const fetchCurrentUserId = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setCurrentUserId(data.userId);
      }
    } catch (error) {
      console.error('Failed to fetch current user ID:', error);
    }
  };

  // Helper to get partner from partnership
  const getPartner = (partnership: Partnership): User => {
    if (!currentUserId) return partnership.user1;
    return partnership.user1Id === currentUserId ? partnership.user2 : partnership.user1;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const response = await fetch('/api/partnership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerEmail: email }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || t('invitationFailed'));
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setEmail('');
      fetchPartnerships();
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      setError(t('errorOccurred'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async (partnershipId: string) => {
    try {
      const response = await fetch('/api/partnership', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnershipId, action: 'accept' }),
      });

      if (response.ok) {
        fetchPartnerships();
        // Redirect to dashboard to see the group view
        setTimeout(() => router.push('/dashboard'), 500);
      }
    } catch (error) {
      console.error('Failed to accept invitation:', error);
    }
  };

  const handleDecline = async (partnershipId: string) => {
    try {
      const response = await fetch('/api/partnership', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnershipId, action: 'decline' }),
      });

      if (response.ok) {
        fetchPartnerships();
      }
    } catch (error) {
      console.error('Failed to decline invitation:', error);
    }
  };

  const handleLeave = async () => {
    if (!currentPartnership) return;
    if (!confirm(t('leaveConfirm'))) return;

    try {
      const response = await fetch(`/api/partnership?id=${currentPartnership.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchPartnerships();
        // Redirect to dashboard to see solo view
        setTimeout(() => router.push('/dashboard'), 500);
      }
    } catch (error) {
      console.error('Failed to leave partnership:', error);
    }
  };

  const handleCancelInvitation = async (partnershipId: string) => {
    try {
      const response = await fetch(`/api/partnership?id=${partnershipId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchPartnerships();
      }
    } catch (error) {
      console.error('Failed to cancel invitation:', error);
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

        {/* Current Partnership */}
        {currentPartnership && (() => {
          const partner = getPartner(currentPartnership);
          return (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 mb-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('currentPartnership')}</h2>

              <div className="flex justify-between items-start p-4 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-700">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">
                    {partner.name || partner.email}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {partner.email}
                  </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  ✓ {t('partnershipActive')}
                </p>
              </div>
              <button
                onClick={handleLeave}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white rounded-lg font-medium text-sm transition"
              >
                {t('leavePartnership')}
              </button>
            </div>
          </div>
          );
        })()}

        {/* Pending Invitations (Received) */}
        {pendingInvitations.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 mb-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('pendingInvitations')}</h2>

            <div className="space-y-3">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex justify-between items-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {invitation.user1.name || invitation.user1.email}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {invitation.user1.email}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(invitation.id)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white rounded-lg font-medium text-sm transition"
                    >
                      {t('accept')}
                    </button>
                    <button
                      onClick={() => handleDecline(invitation.id)}
                      className="px-4 py-2 bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 text-white rounded-lg font-medium text-sm transition"
                    >
                      {t('decline')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sent Invitations */}
        {sentInvitations.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 mb-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('sentInvitations')}</h2>

            <div className="space-y-3">
              {sentInvitations.map((invitation) => (
                <div key={invitation.id} className="flex justify-between items-center p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg border border-yellow-200 dark:border-yellow-700">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {invitation.user2.name || invitation.user2.email}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {invitation.user2.email}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      ⏳ {t('waitingForResponse')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCancelInvitation(invitation.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white rounded-lg font-medium text-sm transition"
                  >
                    {t('cancel')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Partnership Form (only if no active partnership) */}
        {!currentPartnership && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('invitePartner')}</h2>

            {success && (
              <div className="bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-4 rounded-lg mb-4 border border-green-200 dark:border-green-700">
                ✓ {t('invitationSent')}
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-4 rounded-lg mb-4 border border-red-200 dark:border-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {t('partnerEmail')}
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

              <button
                type="submit"
                disabled={isLoading || success}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-lg font-bold text-base shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? t('sending') : success ? `✓ ${t('sent')}` : t('sendInvitation')}
              </button>
            </form>

            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>{t('note')}:</strong> {t('partnershipNote')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
