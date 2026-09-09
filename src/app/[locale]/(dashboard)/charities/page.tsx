'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Money,
  PageHeader,
  Skeleton,
  SkeletonRows,
} from '@/components/ui';
import { translateApiError } from '@/lib/errorCodes';
import { cn } from '@/lib/utils';

interface Charity {
  id: string;
  name: string;
  amount: number;
  isActive: boolean;
}

const EDIT_FORM_ID = 'edit-charity-form';

function IconPlus() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

/** The play triangle points forward — it has to flip with the writing direction. */
function IconPlay() {
  return (
    <svg
      className="h-5 w-5 rtl:rotate-180"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 10-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}

export default function CharitiesPage() {
  const [charities, setCharities] = useState<Charity[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Edit state
  const [editingCharity, setEditingCharity] = useState<Charity | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState('');

  // A failed fetch must never look like "you have nothing yet".
  const [isFetching, setIsFetching] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [listError, setListError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const t = useTranslations('charities');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const locale = useLocale();

  useEffect(() => {
    fetchCharities();
  // Mount-only fetch. The fetcher closes over next-intl's `t`, which is not
  // guaranteed to be referentially stable, so listing it here would re-run the
  // request on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCharities = async () => {
    try {
      const response = await fetch('/api/charities');
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setLoadError(translateApiError(tErrors, data?.error));
        return;
      }

      setLoadError('');
      setCharities(data?.charities || []);
    } catch (error) {
      console.error('Failed to fetch charities:', error);
      setLoadError(translateApiError(tErrors, undefined));
    } finally {
      setIsFetching(false);
    }
  };

  const retryFetch = () => {
    setIsFetching(true);
    setLoadError('');
    fetchCharities();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const amountInAgorot = Math.round(parseFloat(amount) * 100);

      const response = await fetch('/api/charities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          amount: amountInAgorot,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(translateApiError(tErrors, data?.error));
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setName('');
      setAmount('');
      fetchCharities();
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError(translateApiError(tErrors, undefined));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    setListError('');
    setBusyId(id);

    try {
      const response = await fetch('/api/charities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          isActive: !currentStatus,
        }),
      });

      if (response.ok) {
        fetchCharities();
      } else {
        const data = await response.json().catch(() => null);
        setListError(translateApiError(tErrors, data?.error));
      }
    } catch (error) {
      console.error('Failed to toggle charity:', error);
      setListError(translateApiError(tErrors, undefined));
    } finally {
      setBusyId(null);
    }
  };

  const deleteCharity = async (id: string) => {
    setListError('');
    setBusyId(id);

    try {
      const response = await fetch(`/api/charities?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchCharities();
      } else {
        const data = await response.json().catch(() => null);
        setListError(translateApiError(tErrors, data?.error));
      }
    } catch (error) {
      console.error('Failed to delete charity:', error);
      setListError(translateApiError(tErrors, undefined));
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  };

  const openEdit = (charity: Charity) => {
    setEditError('');
    setEditingCharity(charity);
    setEditName(charity.name);
    setEditAmount((charity.amount / 100).toString());
  };

  const closeEdit = () => {
    setEditingCharity(null);
    setEditName('');
    setEditAmount('');
    setEditError('');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCharity) return;

    setEditError('');
    setIsEditing(true);

    try {
      const amountInAgorot = Math.round(parseFloat(editAmount) * 100);

      const response = await fetch('/api/charities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCharity.id,
          name: editName,
          amount: amountInAgorot,
        }),
      });

      if (response.ok) {
        fetchCharities();
        closeEdit();
      } else {
        const data = await response.json().catch(() => null);
        setEditError(translateApiError(tErrors, data?.error));
      }
    } catch (error) {
      console.error('Failed to edit charity:', error);
      setEditError(translateApiError(tErrors, undefined));
    } finally {
      setIsEditing(false);
    }
  };

  const activeCharities = charities.filter((c) => c.isActive);
  const totalMonthly = activeCharities.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader title={t('title')} description={t('subtitle')} />

        {/* The month's standing commitment — the one figure this page owns. */}
        <Card className="border-brand-line bg-brand-soft">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <p className="text-eyebrow uppercase text-brand-soft-ink opacity-80">
                {t('totalMonthlyCommitment')}
              </p>
              <div className="mt-1.5">
                {isFetching ? (
                  <Skeleton className="h-11 w-44" />
                ) : (
                  <Money
                    agorot={totalMonthly}
                    locale={locale}
                    size="lg"
                    tone="inherit"
                    className="text-brand-soft-ink"
                  />
                )}
              </div>
            </div>
            {!isFetching && !loadError ? (
              <Badge tone="brand" className="bg-surface">
                {t('activeCount', { count: activeCharities.length })}
              </Badge>
            ) : null}
          </div>
        </Card>

        {/* Add a charity */}
        <Card>
          <CardHeader title={t('addCharity')} />

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {success ? <Alert tone="success">{t('addedSuccess')}</Alert> : null}
            {error ? <Alert tone="error">{error}</Alert> : null}

            <Field
              id="name"
              label={t('name')}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
            />

            <Field
              id="amount"
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

            <Button
              type="submit"
              size="lg"
              fullWidth
              disabled={success}
              pending={isLoading}
              pendingLabel={t('adding')}
              startSlot={success ? <IconCheck /> : <IconPlus />}
            >
              {success ? t('added') : t('addCharity')}
            </Button>
          </form>
        </Card>

        {/* The list */}
        <Card>
          <CardHeader title={t('yourFixedCharities')} />

          <div className="mt-5 space-y-3">
            {listError ? <Alert tone="error">{listError}</Alert> : null}

            {isFetching ? (
              <SkeletonRows rows={3} />
            ) : loadError ? (
              <Alert
                tone="error"
                action={
                  <Button variant="secondary" size="sm" onClick={retryFetch}>
                    {tCommon('retry')}
                  </Button>
                }
              >
                {loadError}
              </Alert>
            ) : charities.length === 0 ? (
              <EmptyState
                icon={<IconHeart />}
                title={t('noCharities')}
                description={t('addFirst')}
              />
            ) : (
              <ul className="space-y-2">
                {charities.map((charity) => (
                  <li
                    key={charity.id}
                    className="rounded-row border border-line bg-surface-sunken p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
                      {/* Only the content dims when paused — never the controls
                          that bring it back. */}
                      <div
                        className={cn(
                          'min-w-0 flex-1 basis-40',
                          !charity.isActive && 'opacity-55'
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bidi-isolate min-w-0 truncate font-semibold text-ink">
                            {charity.name}
                          </span>
                          {!charity.isActive ? (
                            <Badge tone="neutral">{t('inactive')}</Badge>
                          ) : null}
                        </div>
                        <div className="mt-0.5">
                          <Money
                            agorot={charity.amount}
                            locale={locale}
                            size="sm"
                            tone={charity.isActive ? 'default' : 'muted'}
                          />
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="md"
                          icon
                          onClick={() => openEdit(charity)}
                          aria-label={t('edit')}
                          title={t('edit')}
                        >
                          <IconPencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="md"
                          icon
                          pending={busyId === charity.id}
                          onClick={() => toggleActive(charity.id, charity.isActive)}
                          aria-label={charity.isActive ? t('pause') : t('activate')}
                          title={charity.isActive ? t('pause') : t('activate')}
                        >
                          {charity.isActive ? <IconPause /> : <IconPlay />}
                        </Button>
                        <Button
                          variant="danger"
                          size="md"
                          icon
                          onClick={() => setConfirmDeleteId(charity.id)}
                          aria-label={t('delete')}
                          title={t('delete')}
                        >
                          <IconTrash />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        onConfirm={() => confirmDeleteId && deleteCharity(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
        title={t('delete')}
        message={t('deleteConfirm')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
      />

      <Dialog
        open={editingCharity !== null}
        onClose={closeEdit}
        title={t('editCharity')}
        closeLabel={tCommon('close')}
        footer={
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              className="flex-1 basis-32"
              onClick={closeEdit}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              form={EDIT_FORM_ID}
              className="flex-1 basis-32"
              pending={isEditing}
              pendingLabel={t('saving')}
            >
              {t('save')}
            </Button>
          </div>
        }
      >
        <form id={EDIT_FORM_ID} onSubmit={handleEdit} className="space-y-4">
          {editError ? <Alert tone="error">{editError}</Alert> : null}

          <Field
            id="editName"
            label={t('name')}
            type="text"
            required
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />

          <Field
            id="editAmount"
            label={t('amount')}
            affix="₪"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
          />
        </form>
      </Dialog>
    </div>
  );
}
