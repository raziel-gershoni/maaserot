import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth } from '@/lib/calculations';
import {
  calculateCurrentMonthState,
  calculateGroupMonthState,
} from '@/lib/monthState';
import { translateApiError } from '@/lib/errorCodes';
import {
  Alert,
  Badge,
  buttonStyles,
  Card,
  CardHeader,
  EmptyState,
  Figure,
  PageHeader,
  ReckoningBar,
  SectionRule,
  Skeleton,
  SkeletonRows,
} from '@/components/ui';
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

/* -------------------------------------------------------------------------- */
/* Icons — non-directional, so no rtl:rotate-180 needed.                       */
/* -------------------------------------------------------------------------- */

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.25 1.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

/** A quiet supporting figure. Everything here sits below the hero number. */
function StatTile({
  label,
  agorot,
  locale,
  tone = 'default',
}: {
  label: string;
  agorot: number;
  locale: string;
  tone?: 'default' | 'muted' | 'positive';
}) {
  return (
    <div className="rounded-row bg-surface-sunken p-4">
      <Figure label={label} agorot={agorot} locale={locale} size="sm" tone={tone} />
    </div>
  );
}

function formatMonthLabel(month: string, locale: string) {
  const [y, m] = month.split('-');
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString(
    locale === 'he' ? 'he-IL' : 'en-US',
    { year: 'numeric', month: 'long' }
  );
}

/* -------------------------------------------------------------------------- */
/* Data                                                                        */
/* -------------------------------------------------------------------------- */

async function loadDashboard(
  userId: string,
  sessionEmail: string,
  selectedMonth: string
) {
  const [user, partnership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true, name: true },
    }),
    prisma.partnership.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        user1: { select: { id: true, name: true, email: true, telegramId: true } },
        user2: { select: { id: true, name: true, email: true, telegramId: true } },
      },
    }),
  ]);

  const locale = user?.locale || 'he';

  const partner = partnership
    ? partnership.user1Id === userId
      ? partnership.user2
      : partnership.user1
    : null;

  const hasPartner = !!partner;
  const hasPartnerTelegram = !!partner?.telegramId;

  // The group totals come from the shared reckoning, the same function the
  // history page uses. They used to be computed inline here with a stricter
  // payment-matching rule, so the two screens reported different amounts owed
  // for the same month — and this is the screen with the Pay button.
  const [groupState, myMonthState, partnerMonthState] = await Promise.all([
    calculateGroupMonthState(userId, selectedMonth),
    calculateCurrentMonthState(userId, selectedMonth),
    partner ? calculateCurrentMonthState(partner.id, selectedMonth) : null,
  ]);

  const members: GroupMember[] = [
    {
      userId,
      name: user?.name || '',
      email: sessionEmail,
      monthState: myMonthState,
    },
  ];

  if (partner && partnerMonthState) {
    members.push({
      userId: partner.id,
      name: partner.name || '',
      email: partner.email,
      monthState: partnerMonthState,
    });
  }

  return {
    locale,
    hasPartner,
    hasPartnerTelegram,
    groupData: {
      members,
      totals: {
        totalMaaser: groupState.totalMaaser,
        totalFixedCharities: groupState.fixedCharitiesTotal,
        totalPaid: groupState.totalPaid,
        unpaid: groupState.unpaid,
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex items-center justify-center">
        <Skeleton className="h-9 w-56" />
      </div>

      <Card>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-6 h-4 w-24" />
        <Skeleton className="mt-2 h-11 w-52" />
        <Skeleton className="mt-6 h-2.5 w-full rounded-full" />
        <Skeleton className="mt-3 h-3 w-3/4" />
        <Skeleton className="mt-6 h-12 w-44" />
        <SkeletonRows rows={3} className="mt-6" />
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Body                                                                        */
/* -------------------------------------------------------------------------- */

async function DashboardBody({
  userId,
  sessionEmail,
  selectedMonth,
  maxMonth,
}: {
  userId: string;
  sessionEmail: string;
  selectedMonth: string;
  maxMonth: string;
}) {
  const [t, tErrors] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('errors'),
  ]);

  let data: Awaited<ReturnType<typeof loadDashboard>>;
  try {
    data = await loadDashboard(userId, sessionEmail, selectedMonth);
  } catch (error) {
    // A failed read must never look like "you have nothing yet".
    return <Alert tone="error">{translateApiError(tErrors, error)}</Alert>;
  }

  const { locale, hasPartner, hasPartnerTelegram, groupData } = data;
  const { totals, members } = groupData;
  const isSettled = totals.unpaid === 0;

  const paymentModalTranslations = {
    title: hasPartner ? t('groupPayment') : t('paymentAmount'),
    description: t('groupPaymentDescription'),
    amountToPay: t('amountToPay'),
    cancel: t('cancel'),
    processing: t('processing'),
    confirmPayment: t('confirmPayment'),
    advancePaymentCredit: t('advancePaymentCredit'),
    creditMessage: t('creditMessage'),
  };

  const memberIds = members.map((m: GroupMember) => m.userId);

  return (
    <div className="space-y-6">
      <MonthNavigator
        currentMonth={selectedMonth}
        maxMonth={maxMonth}
        formattedMonth={formatMonthLabel(selectedMonth, locale)}
        locale={locale}
        translations={{
          previousMonth: t('previousMonth'),
          nextMonth: t('nextMonth'),
          currentMonth: t('currentMonth'),
        }}
      />

      {totals.totalMaaser > 0 ? (
        <>
          {/* The reckoning: one number, one measure, one action. */}
          <Card>
            <SectionRule
              trailing={
                isSettled ? (
                  <Badge tone="success" icon={<CheckIcon />}>
                    {t('paid')}
                  </Badge>
                ) : (
                  <Badge tone="warning" icon={<ClockIcon />}>
                    {t('unpaid')}
                  </Badge>
                )
              }
            >
              {hasPartner ? t('groupSummary') : t('currentMonth')}
            </SectionRule>

            <Figure
              className="mt-6"
              label={t('extraToGive')}
              agorot={totals.unpaid}
              locale={locale}
              size="lg"
              tone={isSettled ? 'positive' : 'default'}
              hint={isSettled ? t('nothingToPay') : undefined}
            />

            <ReckoningBar
              className="mt-6"
              totalMaaser={totals.totalMaaser}
              fixedCharities={totals.totalFixedCharities}
              paid={totals.totalPaid}
              locale={locale}
              labels={{
                fixed: t('fixedCharities'),
                paid: t('totalPaid'),
                remaining: t('extraToGive'),
                empty: t('noIncomeThisMonth'),
              }}
            />

            <div className="mt-6 flex flex-wrap gap-3">
              <GroupPaymentModal
                month={selectedMonth}
                totalUnpaid={totals.unpaid}
                locale={locale}
                label={
                  totals.unpaid > 0
                    ? hasPartner
                      ? t('markGroupAsPaid')
                      : t('markAsPaid')
                    : hasPartner
                      ? t('payGroupInAdvance')
                      : t('payInAdvance')
                }
                memberIds={memberIds}
                translations={paymentModalTranslations}
              />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatTile
                label={t('totalMaaser')}
                agorot={totals.totalMaaser}
                locale={locale}
              />
              <StatTile
                label={t('fixedCharities')}
                agorot={totals.totalFixedCharities}
                locale={locale}
                tone="muted"
              />
              <StatTile
                label={t('totalPaid')}
                agorot={totals.totalPaid}
                locale={locale}
                tone={totals.totalPaid > 0 ? 'positive' : 'muted'}
              />
            </div>
          </Card>

          {/* Who owes what — only meaningful once there is a partner. */}
          {hasPartner && (
            <Card>
              <CardHeader
                title={t('partnerBreakdown')}
                action={
                  hasPartnerTelegram ? (
                    <RemindPartnerButton
                      translations={{
                        remindPartner: t('remindPartner'),
                        reminderSent: t('reminderSent'),
                        reminderFailed: t('reminderFailed'),
                      }}
                    />
                  ) : undefined
                }
              />

              <ul className="mt-5 space-y-3">
                {members.map((member: GroupMember) => (
                  <li
                    key={member.userId}
                    className="rounded-row bg-surface-sunken p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 font-semibold text-ink">
                        {member.name || (
                          <span className="bidi-isolate">{member.email}</span>
                        )}
                      </p>
                      {member.userId === userId ? (
                        <Badge tone="brand">{t('you')}</Badge>
                      ) : null}
                    </div>
                    {member.name ? (
                      <p className="bidi-isolate mt-0.5 text-sm text-ink-faint">
                        {member.email}
                      </p>
                    ) : null}

                    {member.monthState ? (
                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <Figure
                          label={t('totalMaaser')}
                          agorot={member.monthState.totalMaaser}
                          locale={locale}
                          size="sm"
                        />
                        <Figure
                          label={t('fixedCharities')}
                          agorot={member.monthState.fixedCharitiesTotal}
                          locale={locale}
                          size="sm"
                          tone="muted"
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-ink-faint">
                        {t('noDataForMonth')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : (
        /* Nothing logged yet this month — invite the first income, and keep
           paying ahead available. */
        <EmptyState
          icon={<PlusIcon />}
          title={t('noIncomeThisMonth')}
          description={t('addFirstIncome')}
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/income" className={buttonStyles({ size: 'md' })}>
                {t('addIncome')}
              </Link>
              <GroupPaymentModal
                month={selectedMonth}
                totalUnpaid={0}
                locale={locale}
                label={hasPartner ? t('payGroupInAdvance') : t('payInAdvance')}
                memberIds={memberIds}
                translations={paymentModalTranslations}
              />
            </div>
          }
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default async function DashboardPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  // Phase 1: Auth + translations in parallel
  const [session, t, params, { locale: routeLocale }] = await Promise.all([
    auth(),
    getTranslations('dashboard'),
    searchParams,
    routeParams,
  ]);

  if (!session?.user?.id) {
    // localePrefix is 'always', so an unprefixed /login is a 404.
    redirect(`/${routeLocale}/login`);
  }

  const maxMonth = getCurrentMonth();
  const monthParam = params.month;

  // Validate month param: must be YYYY-MM format and not in the future
  const isValidMonth =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) && monthParam <= maxMonth;
  const selectedMonth = isValidMonth ? monthParam : maxMonth;

  return (
    <div className="px-4 py-6 sm:px-6 md:py-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader title={t('title')} description={t('subtitle')} />

        {/* Keyed on the month so switching months shows the skeleton again
            rather than freezing the previous month's figures. */}
        <Suspense key={selectedMonth} fallback={<DashboardSkeleton />}>
          <DashboardBody
            userId={session.user.id}
            sessionEmail={session.user.email || ''}
            selectedMonth={selectedMonth}
            maxMonth={maxMonth}
          />
        </Suspense>
      </div>
    </div>
  );
}
