'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/routing';
import ConfirmDialog from '@/components/ConfirmDialog';
import MonthNavigator from '@/components/MonthNavigator';
import { getCurrentMonth } from '@/lib/calculations';
import { translateApiError } from '@/lib/errorCodes';
import {
  Alert,
  Badge,
  Button,
  buttonStyles,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Figure,
  Money,
  PageHeader,
  Skeleton,
  SkeletonRows,
} from '@/components/ui';

interface Income {
  id: string;
  amount: number;
  percentage: number;
  maaser: number;
  description: string | null;
  isFrozen: boolean;
  createdAt: string;
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.25" y="8.75" width="11.5" height="7.5" rx="2" />
      <path d="M7 8.75V6.5a3 3 0 0 1 6 0v2.25" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.9 4.1a1.55 1.55 0 0 1 2.2 2.2l-8 8-3 .8.8-3 8-8z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.75 5.75h12.5M8 5.75V4.25h4v1.5M6.5 5.75l.6 9.5h5.8l.6-9.5" />
    </svg>
  );
}

function LedgerIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="5" width="15" height="10" rx="2" />
      <circle cx="10" cy="10" r="2.25" />
    </svg>
  );
}

export default function IncomePage() {
  return (
    <Suspense fallback={<IncomePageFallback />}>
      <IncomeView />
    </Suspense>
  );
}

function IncomePageFallback() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-12 w-full" />
      <SkeletonRows rows={3} />
    </div>
  );
}

function IncomeView() {
  const t = useTranslations('income');
  const tCommon = useTranslations('common');
  const tDashboard = useTranslations('dashboard');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  // The month the page is looking at. `?month=` is validated the same way the
  // dashboard validates it: well-formed and never in the future.
  const maxMonth = getCurrentMonth();
  const monthParam = searchParams.get('month');
  const month =
    monthParam && MONTH_PATTERN.test(monthParam) && monthParam <= maxMonth
      ? monthParam
      : maxMonth;
  const isCurrentMonth = month === maxMonth;

  const formattedMonth = useMemo(() => {
    const [year, m] = month.split('-');
    return new Date(Number(year), Number(m) - 1).toLocaleDateString(
      locale === 'he' ? 'he-IL' : 'en-US',
      { year: 'numeric', month: 'long' }
    );
  }, [month, locale]);

  // Add form
  const [amount, setAmount] = useState('');
  const [percentage, setPercentage] = useState('10');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // List
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Row editing / deleting
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editPercentage, setEditPercentage] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const requestRef = useRef(0);

  const loadIncomes = useCallback(
    async (quiet = false) => {
      const token = ++requestRef.current;
      const isStale = () => token !== requestRef.current;

      if (!quiet) setIsFetching(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/income?month=${month}`);
        const data = await response.json().catch(() => null);
        if (isStale()) return;

        if (!response.ok) {
          setLoadError(data?.error ?? 'SERVER_ERROR');
          setIncomes([]);
          return;
        }

        setIncomes(data?.incomes ?? []);
      } catch {
        if (isStale()) return;
        setLoadError('SERVER_ERROR');
        setIncomes([]);
      } finally {
        if (!isStale() && !quiet) setIsFetching(false);
      }
    },
    [month]
  );

  useEffect(() => {
    loadIncomes();
  }, [loadIncomes]);

  // Leaving a month drops any in-flight row interaction with it.
  useEffect(() => {
    setEditingId(null);
    setRowError(null);
    setConfirmDeleteId(null);
  }, [month]);

  useEffect(() => {
    const fetchUserSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          setPercentage(data.settings.defaultPercent.toString());
        }
      } catch (error) {
        console.error('Failed to fetch user settings:', error);
      }
    };

    fetchUserSettings();
  }, []);

  const totals = useMemo(
    () =>
      incomes.reduce(
        (acc, income) => ({
          gross: acc.gross + income.amount,
          maaser: acc.maaser + income.maaser,
        }),
        { gross: 0, maaser: 0 }
      ),
    [incomes]
  );

  // Mirrors the server: maaser is rounded from the agorot amount.
  const previewMaaser = useMemo(() => {
    const shekels = parseFloat(amount);
    const percent = parseInt(percentage, 10);
    if (!Number.isFinite(shekels) || !Number.isFinite(percent)) return null;
    const agorot = Math.round(shekels * 100);
    if (agorot <= 0 || percent <= 0) return null;
    return Math.round(agorot * (percent / 100));
  }, [amount, percentage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      const amountInAgorot = Math.round(parseFloat(amount) * 100);

      const response = await fetch('/api/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountInAgorot,
          percentage: parseInt(percentage),
          description,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setSubmitError(data?.error ?? 'SERVER_ERROR');
        setIsSubmitting(false);
        return;
      }

      setSuccess(true);
      setAmount('');
      setDescription('');
      loadIncomes(true);

      // Redirect to dashboard after a moment
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch {
      setSubmitError('SERVER_ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (income: Income) => {
    setRowError(null);
    setEditingId(income.id);
    setEditAmount((income.amount / 100).toString());
    setEditPercentage(income.percentage.toString());
    setEditDescription(income.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditAmount('');
    setEditPercentage('');
    setEditDescription('');
  };

  const saveEdit = async (id: string) => {
    setRowError(null);
    setIsSavingEdit(true);

    try {
      const amountInAgorot = Math.round(parseFloat(editAmount) * 100);

      const response = await fetch('/api/income', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          amount: amountInAgorot,
          percentage: parseInt(editPercentage),
          description: editDescription,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setRowError(data?.error ?? 'SERVER_ERROR');
        return;
      }

      await loadIncomes(true);
      cancelEdit();
    } catch {
      setRowError('SERVER_ERROR');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteIncome = async (id: string) => {
    setRowError(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/income?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setRowError(data?.error ?? 'SERVER_ERROR');
        return;
      }

      await loadIncomes(true);
    } catch {
      setRowError('SERVER_ERROR');
    } finally {
      setIsDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  const formatRowDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });

  return (
    <div>
      <div className="space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title={t('title')} description={t('subtitle')} />

        {/* The navigator's own mb-6 collapses with the stack's mt-6, so the
            gap stays a single step. */}
        <MonthNavigator
          currentMonth={month}
          maxMonth={maxMonth}
          formattedMonth={formattedMonth}
          locale={locale}
          translations={{
            previousMonth: tDashboard('previousMonth'),
            nextMonth: tDashboard('nextMonth'),
            currentMonth: tDashboard('currentMonth'),
          }}
        />

        {/* Month summary */}
        {!loadError && (
          <Card>
            {isFetching ? (
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : (
              /* Two figures share a row down to 360px, so the money sits a
                 step below the hero size and cannot outrun its column. */
              <div className="grid grid-cols-2 gap-4">
                <Figure
                  label={tDashboard('totalIncome')}
                  agorot={totals.gross}
                  locale={locale}
                  size="sm"
                />
                <Figure
                  label={tDashboard('totalMaaser')}
                  agorot={totals.maaser}
                  locale={locale}
                  size="sm"
                  tone="brand"
                />
              </div>
            )}
          </Card>
        )}

        {/* Entry form — the API writes to the current month only, so a past
            month is read-only and says so rather than failing on submit. */}
        {isCurrentMonth ? (
          <Card>
            <CardHeader title={t('addIncome')} />

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {success ? (
                <Alert tone="success">{t('addedSuccess')}</Alert>
              ) : null}

              {submitError ? (
                <Alert tone="error">
                  {translateApiError(tErrors, submitError)}
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="income-amount"
                  label={t('amount')}
                  affix="₪"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('amountPlaceholder')}
                />

                <Field
                  id="income-percentage"
                  label={t('percentage')}
                  affix="%"
                  hint={t('defaultPercentage')}
                  type="number"
                  min="1"
                  max="100"
                  inputMode="numeric"
                  required
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                />
              </div>

              <Field
                id="income-description"
                label={t('descriptionOptional')}
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
              />

              {previewMaaser !== null ? (
                <div className="rounded-row border border-brand-line bg-brand-soft px-4 py-3">
                  <p className="text-eyebrow uppercase text-brand-soft-ink">
                    {t('maaser')}
                  </p>
                  <div className="mt-1">
                    <Money
                      agorot={previewMaaser}
                      locale={locale}
                      size="md"
                      tone="inherit"
                      className="text-brand-soft-ink"
                    />
                  </div>
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                fullWidth
                disabled={success}
                pending={isSubmitting}
                pendingLabel={t('adding')}
                startSlot={success ? <CheckIcon /> : <PlusIcon />}
              >
                {success ? t('added') : t('addIncome')}
              </Button>
            </form>
          </Card>
        ) : (
          <Alert
            tone="info"
            title={t('viewingPastMonth')}
            action={
              <Link
                href="/income"
                className={buttonStyles({ variant: 'secondary', size: 'sm' })}
              >
                {tDashboard('currentMonth')}
              </Link>
            }
          >
            {t('viewingPastMonthHelp')}
          </Alert>
        )}

        {/* Entries for the viewed month */}
        <Card>
          <CardHeader
            title={t('entries')}
            description={formattedMonth}
            action={
              <Link
                href="/history"
                className={buttonStyles({ variant: 'ghost', size: 'sm' })}
              >
                {tDashboard('viewHistory')}
              </Link>
            }
          />

          <div className="mt-5 space-y-4">
            {rowError ? (
              <Alert tone="error">{translateApiError(tErrors, rowError)}</Alert>
            ) : null}

            {isFetching ? (
              <SkeletonRows rows={3} />
            ) : loadError ? (
              <Alert
                tone="error"
                title={t('loadFailed')}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadIncomes()}
                  >
                    {tCommon('retry')}
                  </Button>
                }
              >
                {translateApiError(tErrors, loadError)}
              </Alert>
            ) : incomes.length === 0 ? (
              <EmptyState
                icon={<LedgerIcon />}
                title={t('noIncome')}
                description={
                  isCurrentMonth ? t('addFirst') : t('noIncomeInMonth')
                }
              />
            ) : (
              <ul className="space-y-2">
                {incomes.map((income) => (
                  <li
                    key={income.id}
                    className="rounded-row bg-surface-sunken p-4"
                  >
                    {editingId === income.id ? (
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field
                            label={t('amount')}
                            affix="₪"
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                          />
                          <Field
                            label={t('percentage')}
                            affix="%"
                            type="number"
                            min="1"
                            max="100"
                            inputMode="numeric"
                            value={editPercentage}
                            onChange={(e) => setEditPercentage(e.target.value)}
                          />
                        </div>
                        <Field
                          label={t('description')}
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder={t('descriptionPlaceholder')}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveEdit(income.id)}
                            pending={isSavingEdit}
                            pendingLabel={t('save')}
                          >
                            {t('save')}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={cancelEdit}
                            disabled={isSavingEdit}
                          >
                            {t('cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink bidi-isolate">
                              {income.description || t('income')}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
                              <span className="tabular">
                                {formatRowDate(income.createdAt)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular bidi-isolate">
                                {income.percentage}%
                              </span>
                              {income.isFrozen ? (
                                <Badge tone="neutral" icon={<LockIcon />}>
                                  {t('frozen')}
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          <div className="text-end">
                            <Money
                              agorot={income.amount}
                              locale={locale}
                              size="sm"
                            />
                            <div className="mt-0.5 flex items-baseline justify-end gap-1 text-xs text-ink-muted">
                              <span>{t('maaser')}</span>
                              <Money
                                agorot={income.maaser}
                                locale={locale}
                                tone="muted"
                                className="text-xs"
                              />
                            </div>
                          </div>
                        </div>

                        {!income.isFrozen ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(income)}
                              startSlot={<PencilIcon />}
                            >
                              {t('edit')}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setConfirmDeleteId(income.id)}
                              startSlot={<TrashIcon />}
                            >
                              {t('delete')}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        onConfirm={() => confirmDeleteId && deleteIncome(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
        title={t('delete')}
        message={t('deleteConfirm')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        isLoading={isDeleting}
      />
    </div>
  );
}
