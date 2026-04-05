import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth, formatCurrency } from '@/lib/calculations';
import { calculateCurrentMonthState } from '@/lib/monthState';
import { getTranslations } from 'next-intl/server';
import GroupPaymentModal from '@/components/GroupPaymentModal';
import MonthNavigator from '@/components/MonthNavigator';
import RemindPartnerButton from '@/components/RemindPartnerButton';

interface MonthState {
  totalMaaser: number;
  fixedCharitiesTotal: number;
  totalPaid: number;
  unpaid: number;
}

interface GroupMember {
  userId: string;
  name: string;
  email: string;
  monthState: MonthState;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // Phase 1: Auth + translations in parallel
  const [session, t, params] = await Promise.all([
    auth(),
    getTranslations('dashboard'),
    searchParams,
  ]);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const maxMonth = getCurrentMonth();
  const monthParam = params.month;

  // Validate month param: must be YYYY-MM format and not in the future
  const isValidMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) && monthParam <= maxMonth;
  const selectedMonth = isValidMonth ? monthParam : maxMonth;

  // Prepare translations for client components (will be finalized after hasPartner is known)
  const getPaymentModalTranslations = (isGroup: boolean) => ({
    title: isGroup ? t('groupPayment') : t('paymentAmount'),
    description: t('groupPaymentDescription'),
    amountToPay: t('amountToPay'),
    cancel: t('cancel'),
    processing: t('processing'),
    confirmPayment: t('confirmPayment'),
    advancePaymentCredit: t('advancePaymentCredit'),
    creditMessage: t('creditMessage'),
  });

  // Phase 2: User data + partnership in parallel
  const [user, partnership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { locale: true, name: true },
    }),
    prisma.partnership.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { user1Id: session.user.id },
          { user2Id: session.user.id },
        ],
      },
      include: {
        user1: { select: { id: true, name: true, email: true, telegramId: true } },
        user2: { select: { id: true, name: true, email: true, telegramId: true } },
      },
    }),
  ]);

  const locale = user?.locale || 'he';

  const partner = partnership
    ? (partnership.user1Id === session.user.id ? partnership.user2 : partnership.user1)
    : null;

  const hasPartner = !!partner;
  const hasPartnerTelegram = !!partner?.telegramId;

  // Phase 3: Month states + group snapshots in parallel
  const allMemberIds = [session.user.id, ...(partner ? [partner.id] : [])];

  const [myMonthState, partnerMonthState, groupSnapshots] = await Promise.all([
    calculateCurrentMonthState(session.user.id, selectedMonth),
    partner ? calculateCurrentMonthState(partner.id, selectedMonth) : null,
    prisma.groupPaymentSnapshot.findMany({
      where: {
        month: selectedMonth,
        members: { some: { userId: { in: allMemberIds } } },
      },
      include: { members: true },
      orderBy: { paidAt: 'asc' },
    }),
  ]);

  // Build group data
  const members: GroupMember[] = [{
    userId: session.user.id,
    name: user?.name || '',
    email: session.user.email || '',
    monthState: myMonthState,
  }];

  if (partner && partnerMonthState) {
    members.push({
      userId: partner.id,
      name: partner.name || '',
      email: partner.email,
      monthState: partnerMonthState,
    });
  }

  // Filter to snapshots that match EXACTLY this group composition
  const exactGroupSnapshots = groupSnapshots.filter((snapshot: typeof groupSnapshots[number]) => {
    const snapshotMemberIds = snapshot.members.map((m: { userId: string }) => m.userId).sort();
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

  // Always use live fixed charities for dashboard calculation
  let groupPaid = 0;
  for (const snapshot of exactGroupSnapshots) {
    groupPaid += snapshot.groupAmountPaid;
  }

  const groupUnpaid = Math.max(0, totalMaaser - totalFixedCharities - groupPaid);

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

        {/* Month Navigation */}
        <MonthNavigator
          currentMonth={selectedMonth}
          maxMonth={maxMonth}
          formattedMonth={(() => {
            const [y, m] = selectedMonth.split('-');
            return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString(
              locale === 'he' ? 'he-IL' : 'en-US',
              { year: 'numeric', month: 'long' }
            );
          })()}
          locale={locale}
          translations={{
            previousMonth: t('previousMonth'),
            nextMonth: t('nextMonth'),
            currentMonth: t('currentMonth'),
          }}
        />

        {/* Unified Group View - Always shown (group of 1 or N) */}
        {groupData.totals.totalMaaser > 0 ? (
          <div className="space-y-6 mb-6">
            {/* Combined Metrics */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                {hasPartner ? t('groupSummary') : t('currentMonth')}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{t('totalMaaser')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {formatCurrency(groupData.totals.totalMaaser, locale)}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{t('fixedCharities')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {formatCurrency(groupData.totals.totalFixedCharities, locale)}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{t('totalPaid')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
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
                  <GroupPaymentModal
                    month={selectedMonth}
                    totalUnpaid={groupData.totals.unpaid}
                    locale={locale}
                    label={groupData.totals.unpaid > 0
                      ? (hasPartner ? t('markGroupAsPaid') : t('markAsPaid'))
                      : (hasPartner ? t('payGroupInAdvance') : t('payInAdvance'))
                    }
                    memberIds={groupData.members.map((m: GroupMember) => m.userId)}
                    translations={getPaymentModalTranslations(hasPartner)}
                  />
                </div>
              </div>
            </div>

            {/* Member Breakdown - Only show when there is a partner */}
            {hasPartner && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('partnerBreakdown')}</h3>
                  {hasPartnerTelegram && (
                    <RemindPartnerButton
                      translations={{
                        remindPartner: t('remindPartner'),
                        reminderSent: t('reminderSent'),
                        reminderFailed: t('reminderFailed'),
                      }}
                    />
                  )}
                </div>
              <div className="space-y-4">
                {groupData.members.map((member: GroupMember) => (
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
            <p className="text-gray-600 dark:text-gray-400 mb-6">{t('addFirstIncome')}</p>
            <GroupPaymentModal
              month={selectedMonth}
              totalUnpaid={0}
              locale={locale}
              label={hasPartner ? t('payGroupInAdvance') : t('payInAdvance')}
              memberIds={groupData.members.map((m: GroupMember) => m.userId)}
              translations={getPaymentModalTranslations(hasPartner)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
