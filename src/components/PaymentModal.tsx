'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { formatCurrency } from '@/lib/calculations';

interface PaymentModalProps {
  month: string;
  unpaidAmount: number;
  locale: string;
  label: string;
  userId: string;
}

export default function PaymentModal({ month, unpaidAmount, locale, label, userId }: PaymentModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(unpaidAmount);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Handle advance payments (when unpaidAmount = 0)
  const isAdvancePayment = unpaidAmount === 0;
  // Allow overpayment - slider max is 2x unpaid, buttons can go higher
  // For advance payments, provide a reasonable range (10000 agorot = 100 shekel)
  const sliderMax = isAdvancePayment ? 10000 : Math.max(unpaidAmount * 2, unpaidAmount + 10000);
  const overpaymentAmount = Math.max(0, paymentAmount - unpaidAmount);

  const handlePayment = async () => {
    if (paymentAmount <= 0) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/payment/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          memberIds: [userId],
          paymentAmount,
        }),
      });

      if (response.ok) {
        setIsOpen(false);
        router.refresh();
      } else {
        const error = await response.json();
        console.error('Failed to process payment:', error);
        alert('Failed to process payment: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Error processing payment');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = () => {
    // For advance payments (unpaidAmount = 0), start at 0; otherwise reset to unpaid amount
    setPaymentAmount(isAdvancePayment ? 0 : unpaidAmount);
    setIsOpen(true);
  };

  return (
    <>
      <button
        onClick={handleOpenModal}
        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white rounded-lg font-bold text-base shadow-md transition active:scale-95"
      >
        {label}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Payment Amount
            </h2>

            <div className="mb-6">
              <div className="mb-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Amount to pay:</div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(Math.max(0, paymentAmount - 100))}
                    disabled={paymentAmount <= 0}
                    className="w-12 h-12 flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-bold text-2xl disabled:opacity-30 disabled:cursor-not-allowed transition active:scale-95"
                  >
                    ↓
                  </button>
                  <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 min-w-[140px] text-center">
                    {formatCurrency(paymentAmount, locale)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(paymentAmount + 100)}
                    className="w-12 h-12 flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-bold text-2xl transition active:scale-95"
                  >
                    ↑
                  </button>
                </div>
              </div>

              <input
                type="range"
                min="0"
                max={sliderMax}
                step="100"
                value={Math.min(paymentAmount, sliderMax)}
                onChange={(e) => setPaymentAmount(parseInt(e.target.value))}
                className="w-full h-4 md:h-3 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 touch-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              />

              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>{formatCurrency(0, locale)}</span>
                <span>{formatCurrency(unpaidAmount, locale)}</span>
              </div>

              {(isAdvancePayment || overpaymentAmount > 0) && (
                <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300 text-center">
                    {isAdvancePayment
                      ? (locale === 'he'
                          ? 'תשלום מראש - הזיכוי יחול על הכנסות עתידיות החודש'
                          : 'Advance payment - credit will apply to future income this month')
                      : (locale === 'he'
                          ? `זיכוי של ${formatCurrency(overpaymentAmount, locale)} יחול על הכנסות עתידיות החודש`
                          : `Credit of ${formatCurrency(overpaymentAmount, locale)} will apply to future income this month`)
                    }
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsOpen(false)}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={isLoading || paymentAmount <= 0}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
