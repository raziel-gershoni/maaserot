'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  Alert,
  Badge,
  Button,
  Card,
  Figure,
  Money,
  SectionRule,
} from '@/components/ui';
import { translateApiError } from '@/lib/errorCodes';
import { cn } from '@/lib/utils';

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
  hasPayments: boolean;
  snapshots: GroupPaymentSnapshot[];
}

/** One income row, exactly as the user entered it. */
export interface HistoryIncomeEntry {
  id: string;
  amount: number;
  percentage: number;
  maaser: number;
  description: string | null;
  /** ISO string — serialized on the server for the client boundary. */
  createdAt: string;
}

interface HistoryListProps {
  monthStates: MonthState[];
  /** The user's own income rows, keyed by month. */
  incomesByMonth: Record<string, HistoryIncomeEntry[]>;
  memberNameMap: Record<string, string>;
  currentUserId: string;
  locale: string;
  formattedMonths: Record<string, string>;
}

/**
 * Wrap a run of latin text so the bidi algorithm cannot reorder it when it is
 * interpolated into a Hebrew sentence. The programmatic twin of `bidi-isolate`,
 * for the cases where the text goes into a message placeholder rather than into
 * an element we control.
 */
function isolate(value: string) {
  return `\u2068${value}\u2069`;
}

const CheckIcon = () => (
  <svg
    className="h-3.5 w-3.5"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 10.5l4 4 8-9" />
  </svg>
);

const ClockIcon = () => (
  <svg
    className="h-3.5 w-3.5"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="10" cy="10" r="7.25" />
    <path d="M10 6v4.25l2.5 1.75" />
  </svg>
);

export default function HistoryList({
  monthStates,
  incomesByMonth,
  memberNameMap,
  currentUserId,
  locale,
  formattedMonths,
}: HistoryListProps) {
  const router = useRouter();
  const t = useTranslations('history');
  const tIncome = useTranslations('income');
  const tDashboard = useTranslations('dashboard');
  const tErrors = useTranslations('errors');

  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const intlLocale = locale === 'he' ? 'he-IL' : 'en-US';

  const formatDay = (value: string | Date) =>
    new Date(value).toLocaleDateString(intlLocale, {
      day: 'numeric',
      month: 'short',
    });

  const formatPercent = (percentage: number) =>
    new Intl.NumberFormat(intlLocale, {
      style: 'percent',
      maximumFractionDigits: 2,
    }).format(percentage / 100);

  const toggleMonth = (month: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  };

  const deletePayment = async (snapshotId: string) => {
    setDeletingId(snapshotId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/payment/unified?id=${snapshotId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        setDeleteError(translateApiError(tErrors, data?.error));
      }
    } catch {
      setDeleteError(translateApiError(tErrors, null));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  // Check if month has any group payments (more than 1 member)
  const hasGroupPayments = (monthState: MonthState) => {
    return monthState.snapshots.some((s) => s.members.length > 1);
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
    return Array.from(partnerIds).map((id) => memberNameMap[id] || 'Unknown');
  };

  // Get member summary for expanded view (from first group snapshot)
  const getMemberSummary = (monthState: MonthState) => {
    // Find the first group snapshot to get member composition
    const groupSnapshot = monthState.snapshots.find(
      (s) => s.members.length > 1
    );
    if (!groupSnapshot) return null;

    const memberStates = groupSnapshot.memberStates as MemberState[];
    return memberStates.map((ms) => ({
      ...ms,
      name:
        ms.userId === currentUserId
          ? t('you')
          : memberNameMap[ms.userId] || 'Unknown',
      isCurrentUser: ms.userId === currentUserId,
    }));
  };

  return (
    <div className="space-y-3">
      {deleteError ? (
        <Alert tone="error" title={t('deletePayment')}>
          {deleteError}
        </Alert>
      ) : null}

      <ul className="space-y-3">
        {monthStates.map((monthState) => {
          const isExpanded = expandedMonths.has(monthState.month);
          const hasGroup = hasGroupPayments(monthState);
          const partnerNames = getPartnerNames(monthState);
          const memberSummary = getMemberSummary(monthState);
          const isPaid = monthState.unpaid === 0 && monthState.hasPayments;
          const panelId = `history-month-${monthState.month}`;

          const monthIncomes = incomesByMonth[monthState.month] ?? [];
          const ownGross = monthIncomes.reduce((sum, i) => sum + i.amount, 0);
          const ownMaaser = monthIncomes.reduce((sum, i) => sum + i.maaser, 0);

          return (
            <Card
              as="li"
              padded={false}
              key={monthState.month}
              className="overflow-hidden"
            >
              {/* Collapsed header — always visible */}
              <h3>
                <button
                  type="button"
                  onClick={() => toggleMonth(monthState.month)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  className="w-full px-4 py-4 text-start font-sans transition-colors hover:bg-surface-sunken focus-visible:-outline-offset-2 sm:px-5"
                >
                  <span className="flex items-start gap-3">
                    <svg
                      className={cn(
                        'mt-1 h-5 w-5 shrink-0 text-ink-faint transition-transform duration-200',
                        isExpanded ? 'rotate-90' : 'rtl:rotate-180'
                      )}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-display text-base font-semibold text-ink sm:text-lg">
                          {formattedMonths[monthState.month] ||
                            monthState.month}
                        </span>
                        <Badge
                          tone={isPaid ? 'success' : 'warning'}
                          icon={isPaid ? <CheckIcon /> : <ClockIcon />}
                        >
                          {isPaid ? t('paid') : t('unpaid')}
                        </Badge>
                      </span>

                      {hasGroup && partnerNames.length > 0 ? (
                        <span className="mt-1 block text-sm text-ink-muted">
                          {t('groupPaymentWith', {
                            names: isolate(partnerNames.join(', ')),
                          })}
                        </span>
                      ) : null}

                      <span className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                        <Figure
                          label={t('totalPaid')}
                          agorot={monthState.totalPaid}
                          locale={locale}
                          size="sm"
                        />
                        <Figure
                          label={t('remaining')}
                          agorot={monthState.unpaid}
                          locale={locale}
                          size="sm"
                          tone="inherit"
                          className={isPaid ? 'text-positive' : 'text-caution'}
                        />
                      </span>
                    </span>
                  </span>
                </button>
              </h3>

              {/* Expanded content */}
              {isExpanded ? (
                <div
                  id={panelId}
                  className="space-y-6 border-t border-line px-4 pt-4 pb-5 sm:px-5"
                >
                  {/* Group members — only when the month has group payments */}
                  {hasGroup && memberSummary ? (
                    <section>
                      <SectionRule>{t('groupMembers')}</SectionRule>

                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {memberSummary.map((member) => (
                          <li
                            key={member.userId}
                            className={cn(
                              'rounded-row border p-3',
                              member.isCurrentUser
                                ? 'border-accent/25 bg-accent-soft'
                                : 'border-line bg-surface'
                            )}
                          >
                            <p
                              className={cn(
                                'bidi-isolate font-semibold break-words',
                                member.isCurrentUser
                                  ? 'text-accent-soft-ink'
                                  : 'text-ink'
                              )}
                            >
                              {member.name}
                            </p>
                            <dl className="mt-2 space-y-1 text-sm">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                <dt className="text-ink-muted">
                                  {t('totalMaaser')}
                                </dt>
                                <dd>
                                  <Money
                                    agorot={member.totalMaaser}
                                    locale={locale}
                                    className="text-sm"
                                  />
                                </dd>
                              </div>
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                <dt className="text-ink-muted">
                                  {t('fixedCharities')}
                                </dt>
                                <dd>
                                  <Money
                                    agorot={member.fixedCharitiesTotal}
                                    locale={locale}
                                    className="text-sm"
                                  />
                                </dd>
                              </div>
                            </dl>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 rounded-row bg-surface-sunken p-3">
                        <p className="text-sm font-semibold text-ink">
                          {t('groupTotal')}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
                          <Figure
                            label={t('totalMaaser')}
                            agorot={memberSummary.reduce(
                              (sum, m) => sum + m.totalMaaser,
                              0
                            )}
                            locale={locale}
                            size="sm"
                            tone="muted"
                          />
                          <Figure
                            label={t('fixedCharities')}
                            agorot={memberSummary.reduce(
                              (sum, m) => sum + m.fixedCharitiesTotal,
                              0
                            )}
                            locale={locale}
                            size="sm"
                            tone="muted"
                          />
                          <Figure
                            label={t('remaining')}
                            agorot={monthState.unpaid}
                            locale={locale}
                            size="sm"
                            tone="inherit"
                            className={
                              isPaid ? 'text-positive' : 'text-caution'
                            }
                          />
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {/* Solo month summary */}
                  {!hasGroup ? (
                    <section>
                      <SectionRule>{t('monthSummary')}</SectionRule>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div className="rounded-row bg-surface-sunken p-3">
                          <Figure
                            label={t('totalMaaser')}
                            agorot={monthState.totalMaaser}
                            locale={locale}
                            size="sm"
                          />
                        </div>
                        <div className="rounded-row bg-surface-sunken p-3">
                          <Figure
                            label={t('fixedCharities')}
                            agorot={monthState.fixedCharitiesTotal}
                            locale={locale}
                            size="sm"
                            tone="muted"
                          />
                        </div>
                        <div className="col-span-2 rounded-row bg-surface-sunken p-3 sm:col-span-1">
                          <Figure
                            label={t('remaining')}
                            agorot={monthState.unpaid}
                            locale={locale}
                            size="sm"
                            tone="inherit"
                            className={
                              isPaid ? 'text-positive' : 'text-caution'
                            }
                          />
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {/* Income line items — what produced the maaser above */}
                  <section>
                    <SectionRule>
                      {t('incomeCount', { count: monthIncomes.length })}
                    </SectionRule>

                    {monthIncomes.length > 0 ? (
                      <>
                        <ul className="mt-3 space-y-2">
                          {monthIncomes.map((entry) => (
                            <li
                              key={entry.id}
                              className="rounded-row border border-line bg-surface px-3 py-2.5"
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <p className="bidi-isolate min-w-0 text-sm font-medium break-words text-ink">
                                  {entry.description || tIncome('income')}
                                </p>
                                <Money
                                  agorot={entry.amount}
                                  locale={locale}
                                  size="sm"
                                />
                              </div>
                              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-ink-faint">
                                <span className="flex items-baseline gap-1.5">
                                  <time
                                    dateTime={entry.createdAt}
                                    suppressHydrationWarning
                                  >
                                    {formatDay(entry.createdAt)}
                                  </time>
                                  <span aria-hidden="true">·</span>
                                  <bdi className="tabular">
                                    {formatPercent(entry.percentage)}
                                  </bdi>
                                </span>
                                <span className="flex items-baseline gap-1.5">
                                  <span className="text-eyebrow uppercase">
                                    {tIncome('maaser')}
                                  </span>
                                  <Money
                                    agorot={entry.maaser}
                                    locale={locale}
                                    tone="brand"
                                    className="text-xs"
                                  />
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>

                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 rounded-row bg-surface-sunken p-3">
                          <Figure
                            label={t('yourIncomeTotal')}
                            agorot={ownGross}
                            locale={locale}
                            size="sm"
                            tone="muted"
                          />
                          <Figure
                            label={t('yourMaaserTotal')}
                            agorot={ownMaaser}
                            locale={locale}
                            size="sm"
                          />
                        </div>

                        {hasGroup ? (
                          <p className="mt-2 text-xs text-ink-faint">
                            {t('ownRowsOnly')}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-3 rounded-row border border-dashed border-line-strong px-3 py-4 text-center text-sm text-ink-muted">
                        {tDashboard('noIncomeThisMonth')}
                      </p>
                    )}
                  </section>

                  {/* Payments */}
                  <section>
                    <SectionRule>{t('payments')}</SectionRule>

                    {monthState.snapshots.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {monthState.snapshots.map((snapshot) => {
                          const isSolo = snapshot.members.length === 1;
                          const otherMembers = snapshot.members
                            .filter((m) => m.userId !== currentUserId)
                            .map((m) => memberNameMap[m.userId] || 'Unknown');

                          return (
                            <li
                              key={snapshot.id}
                              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-row border border-line bg-surface px-3 py-2"
                            >
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Money
                                  agorot={snapshot.groupAmountPaid}
                                  locale={locale}
                                  size="sm"
                                />
                                <Badge tone={isSolo ? 'neutral' : 'accent'}>
                                  {isSolo
                                    ? t('soloPayment')
                                    : t('groupPaymentWith', {
                                        names: isolate(
                                          otherMembers.join(', ')
                                        ),
                                      })}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-1">
                                <time
                                  className="text-xs text-ink-faint"
                                  dateTime={new Date(
                                    snapshot.paidAt
                                  ).toISOString()}
                                  suppressHydrationWarning
                                >
                                  {formatDay(snapshot.paidAt)}
                                </time>
                                <Button
                                  variant="ghost"
                                  size="md"
                                  icon
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteError(null);
                                    setConfirmDeleteId(snapshot.id);
                                  }}
                                  pending={deletingId === snapshot.id}
                                  aria-label={t('deletePayment')}
                                  title={t('deletePayment')}
                                  className="text-ink-faint hover:text-critical"
                                >
                                  <svg
                                    className="h-5 w-5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-3 rounded-row border border-dashed border-line-strong px-3 py-4 text-center text-sm text-ink-muted">
                        {t('noPaymentsYet')}
                      </p>
                    )}
                  </section>
                </div>
              ) : null}
            </Card>
          );
        })}
      </ul>

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        onConfirm={() => confirmDeleteId && deletePayment(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
        title={t('deletePayment')}
        message={t('deletePaymentConfirm')}
        confirmLabel={t('deletePayment')}
        cancelLabel={t('cancel')}
        isLoading={deletingId !== null}
      />
    </div>
  );
}
