import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth, formatCurrency } from '@/lib/calculations';
import { calculateCurrentMonthState, calculateTotalAccumulatedUnpaid } from '@/lib/monthState';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import MarkAsPaidButton from '@/components/MarkAsPaidButton';
import GroupMarkAsPaidButton from '@/components/GroupMarkAsPaidButton';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const t = await getTranslations('dashboard');
  const currentMonth = getCurrentMonth();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { locale: true, name: true },
  });

  const locale = user?.locale || 'he';

  // Check if user has selected partners for group view
  const selectedShares = await prisma.sharedAccess.findMany({
    where: {
      viewerId: session.user.id,
      isSelected: true,
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const hasSelectedPartners = selectedShares.length > 0;

  // Fetch group data if there are selected partners
  let groupData = null;
  if (hasSelectedPartners) {
    const members = [];

    // Get current user's data
    const myMonthState = await calculateCurrentMonthState(session.user.id, currentMonth);

    members.push({
      userId: session.user.id,
      name: user?.name || '',
      email: session.user.email || '',
      monthState: myMonthState,
    });

    // Get selected partners' data
    for (const share of selectedShares) {
      const monthState = await calculateCurrentMonthState(share.owner.id, currentMonth);

      members.push({
        userId: share.owner.id,
        name: share.owner.name || '',
        email: share.owner.email,
        monthState,
      });
    }

    // Calculate totals
    let totalMaaser = 0;
    let totalFixedCharities = 0;
    let totalPaid = 0;

    // For snapshot-based calculation
    let snapshotTotalMaaser = 0;
    let snapshotTotalFixedCharities = 0;
    let allMembersHaveSnapshots = true;

    for (const member of members) {
      totalMaaser += member.monthState.totalMaaser;
      totalFixedCharities += member.monthState.fixedCharitiesTotal;
      totalPaid += member.monthState.totalPaid;

      // Track if all members have snapshots
      if (!member.monthState.hasPayments) {
        allMembersHaveSnapshots = false;
      }

      // Collect snapshot totals (from first snapshot of each member)
      if (member.monthState.snapshots.length > 0) {
        const firstSnapshot = member.monthState.snapshots[0];
        snapshotTotalMaaser += firstSnapshot.totalMaaser;
        snapshotTotalFixedCharities += firstSnapshot.fixedCharitiesTotal;
      }
    }

    // Calculate group-level paid amount
    // If ALL members have snapshots, use snapshot totals to calculate what was paid
    // Otherwise, use sum of individual payments
    const groupPaid = allMembersHaveSnapshots
      ? Math.max(0, snapshotTotalMaaser - snapshotTotalFixedCharities)
      : totalPaid;

    // Calculate group-level unpaid (directly, without extraToGive intermediate)
    const groupUnpaid = Math.max(0, totalMaaser - totalFixedCharities - groupPaid);

    groupData = {
      members,
      totals: {
        totalMaaser,
        totalFixedCharities,
        unpaid: groupUnpaid,
      },
    };
  }

  // Fetch personal data
  const monthState = await calculateCurrentMonthState(session.user.id, currentMonth);
  const totalAccumulatedUnpaid = await calculateTotalAccumulatedUnpaid(session.user.id, currentMonth);

  const incomes = await prisma.income.findMany({
    where: {
      userId: session.user.id,
      month: currentMonth,
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">{t('title')}</h1>
          <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">{t('subtitle')}</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4 md:mb-6">
          <Link href="/income" className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg p-3 md:p-4 font-semibold shadow-md transition active:scale-95 text-sm">
            + {t('addIncome')}
          </Link>
          <Link href="/charities" className="flex items-center justify-center bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white rounded-lg p-3 md:p-4 font-semibold shadow-md transition active:scale-95 text-sm">
            {t('manageCharities')}
          </Link>
          <Link href="/history" className="flex items-center justify-center bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white rounded-lg p-3 md:p-4 font-semibold shadow-md transition active:scale-95 text-sm">
            {t('viewHistory')}
          </Link>
        </div>

        {groupData ? (
          /* Group View - Shown when partners are selected */
          <div className="space-y-6 mb-6">
            {/* Combined Metrics */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('groupSummary')}</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-5 border border-blue-200 dark:border-blue-700">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">{t('totalMaaser')}</p>
                  <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                    {formatCurrency(groupData.totals.totalMaaser, locale)}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-5 border border-green-200 dark:border-green-700">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">{t('fixedCharities')}</p>
                  <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                    {formatCurrency(groupData.totals.totalFixedCharities, locale)}
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-lg p-6 border-2 border-indigo-200 dark:border-indigo-700">
                <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200 mb-2">{t('unpaid')}</p>
                <p className="text-4xl font-bold text-indigo-900 dark:text-indigo-100 mb-4">
                  {formatCurrency(groupData.totals.unpaid, locale)}
                </p>

                <div className="flex items-center gap-3">
                  <span className={`inline-block px-4 py-2 rounded-lg text-sm font-bold ${
                    groupData.totals.unpaid === 0
                      ? 'bg-green-600 text-white dark:bg-green-700'
                      : 'bg-yellow-500 text-gray-900 dark:bg-yellow-600 dark:text-gray-100'
                  }`}>
                    {groupData.totals.unpaid === 0 ? '✓ ' + t('paid') : '⏳ ' + t('unpaid')}
                  </span>
                  {groupData.totals.unpaid > 0 && (
                    <GroupMarkAsPaidButton month={currentMonth} label={t('markGroupAsPaid')} />
                  )}
                </div>
              </div>
            </div>

            {/* Partner Breakdown */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('partnerBreakdown')}</h3>
              <div className="space-y-4">
                {groupData.members.map((member: any) => (
                  <div key={member.userId} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {member.name || member.email}
                          {member.userId === session.user.id && <span className="text-sm text-gray-500 ml-2">(You)</span>}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{member.email}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        groupData.totals.unpaid === 0 && member.monthState.unpaid === 0
                          ? 'bg-green-600 text-white'
                          : 'bg-yellow-500 text-gray-900'
                      }`}>
                        {groupData.totals.unpaid === 0 && member.monthState.unpaid === 0 ? '✓ Paid' : '⏳ Unpaid'}
                      </span>
                    </div>
                    {member.monthState ? (
                      <div className="grid grid-cols-3 gap-4 mt-3">
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{t('totalMaaser')}</p>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {formatCurrency(member.monthState.totalMaaser, locale)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{t('fixedCharities')}</p>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {formatCurrency(member.monthState.fixedCharitiesTotal, locale)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{t('unpaid')}</p>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {formatCurrency(member.monthState.unpaid, locale)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">No data for this month</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Personal View - Shown when no partners selected */
          <>
            {monthState.totalMaaser > 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 mb-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('currentMonth')}</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-5 border border-blue-200 dark:border-blue-700">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">{t('totalMaaser')}</p>
                    <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                      {formatCurrency(monthState.totalMaaser, locale)}
                    </p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-5 border border-green-200 dark:border-green-700">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">{t('fixedCharities')}</p>
                    <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                      {formatCurrency(monthState.fixedCharitiesTotal, locale)}
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-lg p-6 border-2 border-indigo-200 dark:border-indigo-700">
                  <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200 mb-2">{t('unpaid')}</p>
                  <p className="text-4xl font-bold text-indigo-900 dark:text-indigo-100 mb-4">
                    {formatCurrency(monthState.unpaid, locale)}
                  </p>

                  <div className="flex items-center gap-3">
                    <span className={`inline-block px-4 py-2 rounded-lg text-sm font-bold ${
                      monthState.unpaid === 0
                        ? 'bg-green-600 text-white dark:bg-green-700'
                        : 'bg-yellow-500 text-gray-900 dark:bg-yellow-600 dark:text-gray-100'
                    }`}>
                      {monthState.unpaid === 0 ? '✓ ' + t('paid') : '⏳ ' + t('unpaid')}
                    </span>
                    {monthState.unpaid > 0 && (
                      <MarkAsPaidButton month={currentMonth} label={t('markAsPaid')} />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 mb-6 border border-gray-200 dark:border-gray-700 text-center">
                <p className="text-xl text-gray-700 dark:text-gray-300 mb-4">{t('nothingToPay')}</p>
                <p className="text-gray-600 dark:text-gray-400">{t('addFirstIncome')}</p>
              </div>
            )}
          </>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('recentIncome')}</h3>
          {incomes.length > 0 ? (
            <ul className="space-y-3">
              {incomes.map((income) => (
                <li key={income.id} className="border-b border-gray-200 dark:border-gray-700 pb-3 last:border-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{income.description || t('income')}</span>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {t('maaser')}: {formatCurrency(income.maaser, locale)} ({income.percentage}%)
                      </div>
                    </div>
                    <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(income.amount, locale)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">{t('noIncomeThisMonth')}</p>
              <Link href="/income" className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg font-semibold transition">
                + {t('addFirstIncome')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
