'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/calculations';

interface MemberState {
  userId: string;
  totalMaaser: number;
  fixedCharitiesTotal: number;
  unpaid: number;
}

interface GroupPaymentMember {
  userId: string;
}

interface GroupPaymentSnapshot {
  id: string;
  month: string;
  groupAmountPaid: number;
  paidAt: Date;
  memberStates: MemberState[];
  members: GroupPaymentMember[];
}

interface MonthState {
  month: string;
  totalMaaser: number;
  fixedCharitiesTotal: number;
  totalPaid: number;
  unpaid: number;
  snapshots: GroupPaymentSnapshot[];
}

interface HistoryListProps {
  monthStates: MonthState[];
  memberNameMap: Record<string, string>;
  currentUserId: string;
  locale: string;
  translations: {
    paid: string;
    remaining: string;
    groupMembers: string;
    you: string;
    groupTotal: string;
    totalMaaser: string;
    fixedCharities: string;
    payments: string;
    soloPayment: string;
    groupPaymentWith: string;
    noPaymentsYet: string;
  };
  formatMonth: (month: string) => string;
}

export default function HistoryList({
  monthStates,
  memberNameMap,
  currentUserId,
  locale,
  translations: t,
  formatMonth,
}: HistoryListProps) {
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const toggleMonth = (month: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  };

  // Check if month has any group payments (more than 1 member)
  const hasGroupPayments = (monthState: MonthState) => {
    return monthState.snapshots.some(s => s.members.length > 1);
  };

  // Get unique partner names for a month (from all group snapshots)
  const getPartnerNames = (monthState: MonthState) => {
    const partnerIds = new Set<string>();
    for (const snapshot of monthState.snapshots) {
      if (snapshot.members.length > 1) {
        for (const member of snapshot.members) {
          if (member.userId !== currentUserId) {
            partnerIds.add(member.userId);
          }
        }
      }
    }
    return Array.from(partnerIds).map(id => memberNameMap[id] || 'Unknown');
  };

  // Get member summary for expanded view (from first group snapshot)
  const getMemberSummary = (monthState: MonthState) => {
    // Find the first group snapshot to get member composition
    const groupSnapshot = monthState.snapshots.find(s => s.members.length > 1);
    if (!groupSnapshot) return null;

    const memberStates = groupSnapshot.memberStates as MemberState[];
    return memberStates.map(ms => ({
      ...ms,
      name: ms.userId === currentUserId ? t.you : (memberNameMap[ms.userId] || 'Unknown'),
      isCurrentUser: ms.userId === currentUserId,
    }));
  };

  return (
    <div className="space-y-3">
      {monthStates.map((monthState) => {
        const isExpanded = expandedMonths.has(monthState.month);
        const hasGroup = hasGroupPayments(monthState);
        const partnerNames = getPartnerNames(monthState);
        const memberSummary = getMemberSummary(monthState);

        return (
          <div
            key={monthState.month}
            className="border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 transition-all"
          >
            {/* Collapsed Header - Always Visible */}
            <button
              onClick={() => toggleMonth(monthState.month)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                {/* Chevron */}
                <svg
                  className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {formatMonth(monthState.month)}
                  </h3>
                  {hasGroup && partnerNames.length > 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {t.groupPaymentWith.replace('{names}', partnerNames.join(', '))}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`text-lg font-semibold ${
                    monthState.unpaid === 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {monthState.unpaid === 0
                    ? `✓ ${t.paid}`
                    : `${formatCurrency(monthState.unpaid, locale)} ${t.remaining}`}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    monthState.unpaid === 0
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                  }`}
                >
                  {monthState.unpaid === 0 ? '✓' : '⏳'}
                </span>
              </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700">
                {/* Group Members Section - Only show if there are group payments */}
                {hasGroup && memberSummary && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      {t.groupMembers}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {memberSummary.map((member) => (
                        <div
                          key={member.userId}
                          className={`rounded-lg p-4 border ${
                            member.isCurrentUser
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600'
                          }`}
                        >
                          <p className={`font-semibold mb-2 ${
                            member.isCurrentUser
                              ? 'text-indigo-700 dark:text-indigo-300'
                              : 'text-gray-900 dark:text-white'
                          }`}>
                            {member.name}
                          </p>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500 dark:text-gray-400">{t.totalMaaser}:</span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(member.totalMaaser, locale)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 dark:text-gray-400">{t.fixedCharities}:</span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(member.fixedCharitiesTotal, locale)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Group Total */}
                    <div className="mt-4 py-3 px-4 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                          {t.groupTotal}:
                        </span>
                        <span className="text-gray-900 dark:text-gray-100">
                          {formatCurrency(memberSummary.reduce((sum, m) => sum + m.totalMaaser, 0), locale)} {t.totalMaaser.toLowerCase()}
                        </span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-900 dark:text-gray-100">
                          {formatCurrency(memberSummary.reduce((sum, m) => sum + m.fixedCharitiesTotal, 0), locale)} {t.fixedCharities.toLowerCase()}
                        </span>
                        <span className="text-gray-400">·</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {formatCurrency(monthState.unpaid, locale)} {t.remaining}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Solo Month Summary - Show summary cards when no group payments */}
                {!hasGroup && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t.totalMaaser}</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(monthState.totalMaaser, locale)}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t.fixedCharities}</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(monthState.fixedCharitiesTotal, locale)}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t.remaining}</p>
                      <p className={`text-xl font-bold ${
                        monthState.unpaid === 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {formatCurrency(monthState.unpaid, locale)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Payments List */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    {t.payments}
                  </h4>
                  {monthState.snapshots.length > 0 ? (
                    <div className="space-y-2">
                      {monthState.snapshots.map((snapshot) => {
                        const isSolo = snapshot.members.length === 1;
                        const otherMembers = snapshot.members
                          .filter(m => m.userId !== currentUserId)
                          .map(m => memberNameMap[m.userId] || 'Unknown');

                        return (
                          <div
                            key={snapshot.id}
                            className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-600"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                {formatCurrency(snapshot.groupAmountPaid, locale)}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                isSolo
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                  : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                              }`}>
                                {isSolo
                                  ? t.soloPayment
                                  : t.groupPaymentWith.replace('{names}', otherMembers.join(', '))}
                              </span>
                            </div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {new Date(snapshot.paidAt).toLocaleDateString(locale, {
                                day: 'numeric',
                                month: 'short'
                              })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      {t.noPaymentsYet}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
