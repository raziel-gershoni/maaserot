import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/calculations';
import { calculateCurrentMonthState } from '@/lib/monthState';
import { getTranslations } from 'next-intl/server';

export default async function HistoryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const t = await getTranslations('history');

  // Get all distinct months that have incomes or snapshots
  const incomeMonths = await prisma.income.findMany({
    where: { userId: session.user.id },
    select: { month: true },
    distinct: ['month']
  });

  const snapshotMonths = await prisma.groupPaymentSnapshot.findMany({
    where: {
      members: { some: { userId: session.user.id } }
    },
    select: { month: true },
    distinct: ['month']
  });

  // Combine and deduplicate months, then sort descending
  const allMonthsSet = new Set<string>([
    ...incomeMonths.map(i => i.month),
    ...snapshotMonths.map(s => s.month)
  ]);
  const months = Array.from(allMonthsSet).sort().reverse();

  // Calculate state for each month
  const monthStates = await Promise.all(
    months.map(async (month) => {
      const state = await calculateCurrentMonthState(session.user.id, month);
      return { month, ...state };
    })
  );

  // Collect all unique member IDs from all snapshots
  const allMemberIds = new Set<string>();
  for (const monthState of monthStates) {
    for (const snapshot of monthState.snapshots) {
      for (const member of snapshot.members) {
        allMemberIds.add(member.userId);
      }
    }
  }

  // Fetch all member names in a single query
  const members = await prisma.user.findMany({
    where: { id: { in: Array.from(allMemberIds) } },
    select: { id: true, name: true, email: true }
  });

  // Build a map of userId -> display name
  const memberNameMap = new Map<string, string>();
  for (const member of members) {
    memberNameMap.set(member.id, member.name || member.email);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { locale: true },
  });

  const locale = user?.locale || 'he';

  // Format month for display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{t('title')}</h1>
          <p className="text-gray-700 dark:text-gray-300">{t('subtitle')}</p>
        </div>

        {/* History List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
          {monthStates.length > 0 ? (
            <div className="space-y-4">
              {monthStates.map((monthState) => {
                return (
                  <div
                    key={monthState.month}
                    className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:border-indigo-300 dark:hover:border-indigo-600 transition bg-gray-50 dark:bg-gray-900"
                  >
                    {/* Month Header */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                          {formatMonth(monthState.month)}
                        </h3>
                        <span
                          className={`inline-block mt-2 px-3 py-1 rounded-lg text-sm font-bold ${
                            monthState.unpaid === 0
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                          }`}
                        >
                          {monthState.unpaid === 0 ? `✓ ${t('paid')}` : `⏳ ${t('unpaid')}`}
                        </span>
                      </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mb-1">{t('totalMaaser')}</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrency(monthState.totalMaaser, locale)}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mb-1">{t('fixedCharities')}</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrency(monthState.fixedCharitiesTotal, locale)}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mb-1">{t('totalPaid')}</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrency(monthState.totalPaid, locale)}
                        </p>
                      </div>
                    </div>

                    {/* Payment History */}
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        {t('payments')}
                      </h4>
                      {monthState.snapshots.length > 0 ? (
                        <div className="space-y-2">
                          {monthState.snapshots.map((snapshot) => {
                            const isSolo = snapshot.members.length === 1;
                            const otherMembers = snapshot.members
                              .filter(m => m.userId !== session.user.id)
                              .map(m => memberNameMap.get(m.userId) || 'Unknown');

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
                                      ? t('soloPayment')
                                      : t('groupPaymentWith', { names: otherMembers.join(', ') })}
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
                          {t('noPaymentsYet')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">{t('noHistory')}</p>
              <p className="text-gray-500 dark:text-gray-400">
                {t('addFirstIncomeToTrack')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
