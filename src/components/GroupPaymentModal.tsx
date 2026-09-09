'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { translateApiError } from '@/lib/errorCodes';
import { Alert, Button, Dialog, Money } from '@/components/ui';

interface GroupPaymentModalProps {
  month: string;
  totalUnpaid: number;
  locale: string;
  label: string;
  memberIds: string[];
  translations: {
    title: string;
    description: string;
    amountToPay: string;
    cancel: string;
    processing: string;
    confirmPayment: string;
    advancePaymentCredit: string;
    creditMessage: string;
  };
}

/** The slider moves in whole shekels. */
const STEP = 100;
/** Headroom offered above what is owed, and the whole range in advance mode. */
const HEADROOM = 10000;

const roundUpToStep = (agorot: number) => Math.ceil(agorot / STEP) * STEP;

function MinusIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 10h10" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M10 5v10M5 10h10" />
    </svg>
  );
}

export default function GroupPaymentModal({
  month,
  totalUnpaid,
  locale,
  label,
  memberIds,
  translations,
}: GroupPaymentModalProps) {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');

  const [isOpen, setIsOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(totalUnpaid);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Handle advance payments (when totalUnpaid = 0)
  const isAdvancePayment = totalUnpaid === 0;

  // The track always offers room to overpay: twice what is owed, or a shekel
  // hundred above it, whichever is further. In advance mode there is nothing
  // owed, so the whole track is headroom.
  const baseMax = roundUpToStep(
    isAdvancePayment ? HEADROOM : Math.max(totalUnpaid * 2, totalUnpaid + HEADROOM)
  );

  // The end label has to describe the real track, so the maximum is state: the
  // steppers and the manual entry can push past `baseMax`, and when they do the
  // track grows with them rather than pinning the thumb and lying about it. It
  // only ever grows within an open modal, so dragging back never rescales
  // underneath the thumb.
  const [sliderMax, setSliderMax] = useState(baseMax);

  const applyAmount = (next: number) => {
    const clamped = Math.max(0, Math.round(next));
    setPaymentAmount(clamped);
    setSliderMax((current) => Math.max(current, roundUpToStep(clamped)));
  };

  const overpaymentAmount = Math.max(0, paymentAmount - totalUnpaid);
  const remainingAfter = Math.max(0, totalUnpaid - paymentAmount);
  const isFullRemaining = !isAdvancePayment && paymentAmount === totalUnpaid;

  // Where "everything still owed" falls on the track. The thumb is 1.375rem
  // wide and its centre travels between half a thumb from each end, so the mark
  // has to follow the same inset to line up with it.
  const remainingPct = sliderMax > 0 ? Math.min(100, (totalUnpaid / sliderMax) * 100) : 0;
  const remainingMarkOffset = `calc(0.6875rem + ${remainingPct}% - ${(
    remainingPct * 0.01375
  ).toFixed(4)}rem)`;

  // "…credit of {amount} will apply…" — the amount is a real <Money>, spliced
  // into the sentence rather than string-formatted into it.
  const [creditBefore, creditAfter = ''] = translations.creditMessage.split('{amount}');

  const handlePayment = async () => {
    if (paymentAmount <= 0) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/payment/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          memberIds,
          paymentAmount,
        }),
      });

      if (response.ok) {
        setIsOpen(false);
        router.refresh();
      } else {
        const data = await response.json().catch(() => null);
        setError(translateApiError(tErrors, data?.error));
      }
    } catch {
      setError(translateApiError(tErrors, undefined));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = () => {
    // For advance payments (totalUnpaid = 0), start at 0; otherwise reset to unpaid amount
    setPaymentAmount(isAdvancePayment ? 0 : totalUnpaid);
    setSliderMax(baseMax);
    setIsEditingAmount(false);
    setError(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    if (isLoading) return;
    setIsEditingAmount(false);
    setIsOpen(false);
  };

  return (
    <>
      <Button
        variant={isAdvancePayment ? 'secondary' : 'primary'}
        size={isAdvancePayment ? 'md' : 'lg'}
        onClick={handleOpenModal}
      >
        {label}
      </Button>

      {/* The proportional-split explanation is only true of an actual group. */}
      <Dialog
        open={isOpen}
        onClose={handleClose}
        title={translations.title}
        description={memberIds.length > 1 ? translations.description : undefined}
        closeLabel={tCommon('close')}
        footer={
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              className="min-w-0 grow basis-32"
              onClick={handleClose}
              disabled={isLoading}
            >
              {translations.cancel}
            </Button>
            <Button
              className="min-w-0 grow basis-32"
              onClick={handlePayment}
              disabled={paymentAmount <= 0}
              pending={isLoading}
              pendingLabel={translations.processing}
            >
              {translations.confirmPayment}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <div>
            <p className="text-sm text-ink-muted">{translations.amountToPay}</p>

            <div className="mt-2 flex items-center justify-center gap-3">
              <Button
                icon
                variant="secondary"
                aria-label={t('decreaseAmount')}
                onClick={() => applyAmount(paymentAmount - STEP)}
                disabled={paymentAmount <= 0}
              >
                <MinusIcon />
              </Button>

              {/* The editable figure sizes to its own content: the old fixed
                  140px could not hold ₪12,345.67 once he-IL adds bidi marks. */}
              {isEditingAmount ? (
                <input
                  type="number"
                  inputMode="decimal"
                  autoFocus
                  aria-label={t('paymentAmount')}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => {
                    const parsed = parseFloat(editValue);
                    applyAmount(isNaN(parsed) || parsed < 0 ? 0 : parsed * 100);
                    setIsEditingAmount(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  style={{
                    width: `${Math.min(Math.max(editValue.length + 2, 6), 14)}ch`,
                  }}
                  className="tabular border-b-2 border-brand bg-transparent text-center font-display text-figure font-semibold text-brand outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              ) : (
                <button
                  type="button"
                  aria-label={t('editAmount')}
                  onClick={() => {
                    setEditValue((paymentAmount / 100).toString());
                    setIsEditingAmount(true);
                  }}
                  className="cursor-text rounded-control px-1 underline-offset-4 decoration-brand/40 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Money
                    agorot={paymentAmount}
                    locale={locale}
                    size="md"
                    tone="brand"
                  />
                </button>
              )}

              <Button
                icon
                variant="secondary"
                aria-label={t('increaseAmount')}
                onClick={() => applyAmount(paymentAmount + STEP)}
              >
                <PlusIcon />
              </Button>
            </div>
          </div>

          <div>
            <div className="relative">
              <input
                type="range"
                min="0"
                max={sliderMax}
                step={STEP}
                value={Math.min(paymentAmount, sliderMax)}
                aria-label={t('paymentAmount')}
                onChange={(e) => applyAmount(parseInt(e.target.value, 10))}
                className="slider-brand block w-full touch-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              />
              {!isAdvancePayment ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-brand/70"
                  style={{
                    insetInlineStart: remainingMarkOffset,
                    marginInlineStart: '-1px',
                  }}
                />
              ) : null}
            </div>

            {/* The ends of the label row are the ends of the track — the old
                copy printed the unpaid total at a maximum it never described. */}
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-ink-faint">
              <Money
                agorot={0}
                locale={locale}
                size="inherit"
                tone="inherit"
                weight="font-medium"
                className="text-xs"
              />
              <Money
                agorot={sliderMax}
                locale={locale}
                size="inherit"
                tone="inherit"
                weight="font-medium"
                className="text-xs"
              />
            </div>

            {!isAdvancePayment ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button
                  size="sm"
                  variant={isFullRemaining ? 'primary' : 'secondary'}
                  aria-pressed={isFullRemaining}
                  onClick={() => applyAmount(totalUnpaid)}
                >
                  <span>{t('fullRemaining')}</span>
                  <Money
                    agorot={totalUnpaid}
                    locale={locale}
                    size="inherit"
                    tone="inherit"
                    className="text-sm"
                  />
                </Button>
                {remainingAfter > 0 ? (
                  <span className="text-xs text-ink-muted">
                    {t('remainingAfter')}{' '}
                    <Money
                      agorot={remainingAfter}
                      locale={locale}
                      size="inherit"
                      tone="inherit"
                      className="text-xs"
                    />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {isAdvancePayment || overpaymentAmount > 0 ? (
            <Alert tone="info">
              {isAdvancePayment ? (
                translations.advancePaymentCredit
              ) : (
                <span>
                  {creditBefore}
                  <Money
                    agorot={overpaymentAmount}
                    locale={locale}
                    size="inherit"
                    tone="inherit"
                  />
                  {creditAfter}
                </span>
              )}
            </Alert>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
