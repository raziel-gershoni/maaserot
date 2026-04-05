import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateGroupMonthStatesInBatch } from '@/lib/monthState';
import { getTranslations } from 'next-intl/server';
import HistoryList from '@/components/HistoryList';

export default async function HistoryPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations('history'),
  ]);

  if (!session?.user?.id) {
    redirect('/login');
  }

  // Get all distinct months that have incomes or snapshots in parallel
  const [incomeMonths, snapshotMonths] = await Promise.all([
    prisma.income.findMany({
      where: { userId: session.user.id },
      select: { month: true },
      distinct: ['month'],
    }),
    prisma.groupPaymentSnapshot.findMany({
      where: {
        members: { some: { userId: session.user.id } },
      },
      select: { month: true },
      distinct: ['month'],
    }),
  ]);

  // Combine and deduplicate months, then sort descending
  const allMonthsSet = new Set<string>([
    ...incomeMonths.map(i => i.month),
    ...snapshotMonths.map(s => s.month)
  ]);
  const months = Array.from(allMonthsSet).sort().reverse();

  // Batch calculate all month states (3-5 queries total instead of 3N+)
  const monthStates = await calculateGroupMonthStatesInBatch(session.user.id, months);

  // Collect all unique member IDs from all snapshots
  const allMemberIds = new Set<string>();
  for (const monthState of monthStates) {
    for (const snapshot of monthState.snapshots) {
      for (const member of snapshot.members) {
        allMemberIds.add(member.userId);
      }
    }
  }

  // Fetch member names and user locale in parallel
  const [members, user] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: Array.from(allMemberIds) } },
      select: { id: true, name: true, email: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { locale: true },
    }),
  ]);

  // Build a map of userId -> display name
  const memberNameMap: Record<string, string> = {};
  for (const member of members) {
    memberNameMap[member.id] = member.name || member.email;
  }

  const locale = user?.locale || 'he';

  // Serialize snapshots for client component
  const serializedMonthStates = monthStates.map(state => ({
    ...state,
    snapshots: state.snapshots.map(snapshot => ({
      ...snapshot,
      paidAt: snapshot.paidAt,
      memberStates: snapshot.memberStates as Array<{
        userId: string;
        totalMaaser: number;
        fixedCharitiesTotal: number;
        unpaid: number;
      }>,
    })),
  }));

  // Prepare translations for client component
  const translations = {
    paid: t('paid'),
    remaining: t('remaining'),
    groupMembers: t('groupMembers'),
    you: t('you'),
    groupTotal: t('groupTotal'),
    totalMaaser: t('totalMaaser'),
    totalPaid: t('totalPaid'),
    fixedCharities: t('fixedCharities'),
    payments: t('payments'),
    soloPayment: t('soloPayment'),
    groupPaymentWith: t('groupPaymentWith'),
    noPaymentsYet: t('noPaymentsYet'),
    deletePayment: t('deletePayment'),
    deletePaymentConfirm: t('deletePaymentConfirm'),
    cancel: t('cancel'),
  };

  // Format month for display - passed as a function to client
  const formatMonthStr = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  };

  // Pre-format all months for the client component
  const formattedMonths: Record<string, string> = {};
  for (const month of months) {
    formattedMonths[month] = formatMonthStr(month);
  }

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
          {serializedMonthStates.length > 0 ? (
            <HistoryList
              monthStates={serializedMonthStates}
              memberNameMap={memberNameMap}
              currentUserId={session.user.id}
              locale={locale}
              translations={translations}
              formattedMonths={formattedMonths}
            />
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
