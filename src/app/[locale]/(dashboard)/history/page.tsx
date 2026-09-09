import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateGroupMonthStatesInBatch } from '@/lib/monthState';
import { Link } from '@/i18n/routing';
import HistoryList, { type HistoryIncomeEntry } from '@/components/HistoryList';
import { EmptyState, PageHeader, SkeletonRows, buttonStyles } from '@/components/ui';

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, t] = await Promise.all([
    params,
    getTranslations('history'),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <div className="mt-6">
        {/* The ledger needs several round trips. Stream it in behind a skeleton
            so the page never shows a blank slab that reads as "no history". */}
        <Suspense fallback={<SkeletonRows rows={4} className="space-y-3" />}>
          <HistoryLedger locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}

async function HistoryLedger({ locale }: { locale: string }) {
  const [session, t, tDashboard] = await Promise.all([
    auth(),
    getTranslations('history'),
    getTranslations('dashboard'),
  ]);

  if (!session?.user?.id) {
    // localePrefix is 'always', so an unprefixed /login is a 404.
    redirect(`/${locale}/login`);
  }

  const userId = session.user.id;

  // Get all distinct months that have incomes or snapshots in parallel
  const [incomeMonths, snapshotMonths] = await Promise.all([
    prisma.income.findMany({
      where: { userId },
      select: { month: true },
      distinct: ['month'],
    }),
    prisma.groupPaymentSnapshot.findMany({
      where: {
        members: { some: { userId } },
      },
      select: { month: true },
      distinct: ['month'],
    }),
  ]);

  // Combine and deduplicate months, then sort descending
  const allMonthsSet = new Set<string>([
    ...incomeMonths.map((i) => i.month),
    ...snapshotMonths.map((s) => s.month),
  ]);
  const months = Array.from(allMonthsSet).sort().reverse();

  // Batch calculate all month states (3-5 queries total instead of 3N+), and
  // fetch the line items behind those totals in the same round trip.
  const [monthStates, incomes] = await Promise.all([
    calculateGroupMonthStatesInBatch(userId, months),
    prisma.income.findMany({
      where: { userId, month: { in: months } },
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  // Collect all unique member IDs from all snapshots
  const allMemberIds = new Set<string>();
  for (const monthState of monthStates) {
    for (const snapshot of monthState.snapshots) {
      for (const member of snapshot.members) {
        allMemberIds.add(member.userId);
      }
    }
  }

  const members = await prisma.user.findMany({
    where: { id: { in: Array.from(allMemberIds) } },
    select: { id: true, name: true, email: true },
  });

  // Build a map of userId -> display name
  const memberNameMap: Record<string, string> = {};
  for (const member of members) {
    memberNameMap[member.id] = member.name || member.email;
  }

  // Group the user's own income rows by month. These rows are what produced the
  // month's maaser — in a month with a group payment the state totals also
  // include partners, so the two are labelled separately in the UI.
  const incomesByMonth: Record<string, HistoryIncomeEntry[]> = {};
  for (const income of incomes) {
    const bucket = (incomesByMonth[income.month] ??= []);
    bucket.push({
      id: income.id,
      amount: income.amount,
      percentage: income.percentage,
      maaser: income.maaser,
      description: income.description,
      createdAt: income.createdAt.toISOString(),
    });
  }

  // Serialize snapshots for client component
  const serializedMonthStates = monthStates.map((state) => ({
    ...state,
    snapshots: state.snapshots.map((snapshot) => ({
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

  if (serializedMonthStates.length === 0) {
    return (
      <EmptyState
        icon={
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        }
        title={t('noHistory')}
        description={t('addFirstIncomeToTrack')}
        action={
          <Link href="/income" className={buttonStyles()}>
            {tDashboard('addIncome')}
          </Link>
        }
      />
    );
  }

  // Month names come from the route locale, not from the stored user
  // preference — /en/history must never render Hebrew month names.
  const intlLocale = locale === 'he' ? 'he-IL' : 'en-US';
  const formattedMonths: Record<string, string> = {};
  for (const month of months) {
    const [year, monthPart] = month.split('-');
    const date = new Date(Number(year), Number(monthPart) - 1);
    formattedMonths[month] = date.toLocaleDateString(intlLocale, {
      year: 'numeric',
      month: 'long',
    });
  }

  return (
    <HistoryList
      monthStates={serializedMonthStates}
      incomesByMonth={incomesByMonth}
      memberNameMap={memberNameMap}
      currentUserId={userId}
      locale={locale}
      formattedMonths={formattedMonths}
    />
  );
}
