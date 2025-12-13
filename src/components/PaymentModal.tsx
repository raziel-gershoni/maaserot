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
    setPaymentAmount(unpaidAmount); // Reset to max when opening
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
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Amount to pay:</span>
                <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(paymentAmount, locale)}
                </span>
              </div>

              <input
                type="range"
                min="0"
                max={unpaidAmount}
                step="100"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseInt(e.target.value))}
                className="w-full h-4 md:h-3 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 touch-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              />

              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>{formatCurrency(0, locale)}</span>
                <span>{formatCurrency(unpaidAmount, locale)}</span>
              </div>

              <div className="mt-4">
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Or enter exact amount (₪):
                </label>
                <input
                  type="number"
                  min="0"
                  max={(unpaidAmount / 100).toFixed(2)}
                  step="0.01"
                  value={(paymentAmount / 100).toFixed(2)}
                  onChange={(e) => {
                    const shekels = parseFloat(e.target.value) || 0;
                    const agorot = Math.round(shekels * 100);
                    setPaymentAmount(Math.min(Math.max(0, agorot), unpaidAmount));
                  }}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
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
