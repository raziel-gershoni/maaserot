import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth, formatCurrency } from '@/lib/calculations';
import { calculateCurrentMonthState } from '@/lib/monthState';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import GroupPaymentModal from '@/components/GroupPaymentModal';

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

  // Check if user has an active partnership
  const partnership = await prisma.partnership.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { user1Id: session.user.id },
        { user2Id: session.user.id },
      ],
    },
    include: {
      user1: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      user2: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const partner = partnership
    ? (partnership.user1Id === session.user.id ? partnership.user2 : partnership.user1)
    : null;

  const hasPartner = !!partner;

  // Build group data - always includes current user, plus partner if exists
  const members = [];

  // Get current user's data
  const myMonthState = await calculateCurrentMonthState(session.user.id, currentMonth);

  members.push({
    userId: session.user.id,
    name: user?.name || '',
    email: session.user.email || '',
    monthState: myMonthState,
  });

  // Add partner if exists
  if (partner) {
    const partnerMonthState = await calculateCurrentMonthState(partner.id, currentMonth);

    members.push({
      userId: partner.id,
      name: partner.name || '',
      email: partner.email,
      monthState: partnerMonthState,
    });
  }

  // Get all member IDs
  const allMemberIds = members.map(m => m.userId);

  // Fetch group snapshots for this month
  const groupSnapshots = await prisma.groupPaymentSnapshot.findMany({
    where: {
      month: currentMonth,
      members: { some: { userId: { in: allMemberIds } } }
    },
    include: { members: true },
    orderBy: { paidAt: 'asc' }
  });

  // Filter to snapshots that match EXACTLY this group composition
  const exactGroupSnapshots = groupSnapshots.filter(snapshot => {
    const snapshotMemberIds = snapshot.members.map(m => m.userId).sort();
    const currentMemberIds = allMemberIds.sort();
    return JSON.stringify(snapshotMemberIds) === JSON.stringify(currentMemberIds);
  });

  // Calculate current totals
  let totalMaaser = 0;
  let totalFixedCharities = 0;
  for (const member of members) {
    totalMaaser += member.monthState.totalMaaser;
    totalFixedCharities += member.monthState.fixedCharitiesTotal;
  }

  // Calculate group paid and effective fixed charities
  let groupPaid = 0;
  let groupFixedCharitiesDeducted = 0;

  for (const snapshot of exactGroupSnapshots) {
    groupPaid += snapshot.groupAmountPaid;
    if (exactGroupSnapshots.indexOf(snapshot) === 0) {
      groupFixedCharitiesDeducted = snapshot.totalGroupFixedCharities;
    }
  }

  const effectiveFixedCharities = exactGroupSnapshots.length > 0
    ? groupFixedCharitiesDeducted
    : totalFixedCharities;

  const groupUnpaid = Math.max(0, totalMaaser - effectiveFixedCharities - groupPaid);

  const groupData = {
    members,
    totals: {
      totalMaaser,
      totalFixedCharities,
      totalPaid: groupPaid,
      unpaid: groupUnpaid,
    },
  };

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

        {/* Unified Group View - Always shown (group of 1 or N) */}
        {groupData.totals.totalMaaser > 0 ? (
          <div className="space-y-6 mb-6">
            {/* Combined Metrics */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                {hasPartner ? t('groupSummary') : t('currentMonth')}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
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
                <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-5 border border-purple-200 dark:border-purple-700">
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-1">{t('totalPaid')}</p>
                  <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                    {formatCurrency(groupData.totals.totalPaid, locale)}
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
                    <GroupPaymentModal
                      month={currentMonth}
                      totalUnpaid={groupData.totals.unpaid}
                      locale={locale}
                      label={hasPartner ? t('markGroupAsPaid') : t('markAsPaid')}
                      memberIds={groupData.members.map((m: any) => m.userId)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Member Breakdown - Only show when there is a partner */}
            {hasPartner && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('partnerBreakdown')}</h3>
              <div className="space-y-4">
                {groupData.members.map((member: any) => (
                  <div key={member.userId} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="mb-3">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {member.name || member.email}
                        {member.userId === session.user.id && <span className="text-sm text-gray-500 ml-2">(You)</span>}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{member.email}</p>
                    </div>
                    {member.monthState ? (
                      <div className="grid grid-cols-2 gap-4">
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
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">No data for this month</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 mb-6 border border-gray-200 dark:border-gray-700 text-center">
            <p className="text-xl text-gray-700 dark:text-gray-300 mb-4">{t('nothingToPay')}</p>
            <p className="text-gray-600 dark:text-gray-400">{t('addFirstIncome')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
