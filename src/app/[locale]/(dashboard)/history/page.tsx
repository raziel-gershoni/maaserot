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

  const snapshotMonths = await prisma.paymentSnapshot.findMany({
    where: { userId: session.user.id },
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
                // Get fixed charities from first snapshot, if any
                const fixedCharities = monthState.snapshots.length > 0
                  ? (monthState.snapshots[0].fixedCharitiesSnapshot as Array<{ name: string; amount: number; }>)
                  : [];

                // Get latest payment date
                const latestSnapshot = monthState.snapshots.length > 0
                  ? monthState.snapshots[monthState.snapshots.length - 1]
                  : null;

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
                      {latestSnapshot && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {t('paidOn')} {new Date(latestSnapshot.paidAt).toLocaleDateString(locale)}
                        </p>
                      )}
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                        <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">{t('totalMaaser')}</p>
                        <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                          {formatCurrency(monthState.totalMaaser, locale)}
                        </p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4 border border-green-200 dark:border-green-700">
                        <p className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">{t('fixedCharities')}</p>
                        <p className="text-xl font-bold text-green-900 dark:text-green-100">
                          {formatCurrency(monthState.fixedCharitiesTotal, locale)}
                        </p>
                      </div>
                      <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-lg p-4 border border-indigo-200 dark:border-indigo-700">
                        <p className="text-xs font-medium text-indigo-800 dark:text-indigo-200 mb-1">{t('totalPaid')}</p>
                        <p className="text-xl font-bold text-indigo-900 dark:text-indigo-100">
                          {formatCurrency(monthState.totalPaid, locale)}
                        </p>
                      </div>
                    </div>

                    {/* Fixed Charities Snapshot */}
                    {fixedCharities && fixedCharities.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                          {t('fixedCharities')} ({fixedCharities.length})
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {fixedCharities.map((charity, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center bg-white dark:bg-gray-800 rounded px-3 py-2 border border-gray-200 dark:border-gray-700"
                            >
                              <span className="text-sm text-gray-700 dark:text-gray-300">{charity.name}</span>
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {formatCurrency(charity.amount, locale)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
