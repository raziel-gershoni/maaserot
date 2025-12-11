'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';

interface GroupMarkAsPaidButtonProps {
  month: string;
  label: string;
}

export default function GroupMarkAsPaidButton({ month, label }: GroupMarkAsPaidButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleMarkGroupAsPaid = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/month/group', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          isPaid: true,
        }),
      });

      if (response.ok) {
        setIsOpen(false);
        router.refresh();
      } else {
        console.error('Failed to mark group as paid');
        alert('Failed to mark group as paid');
      }
    } catch (error) {
      console.error('Error marking group as paid:', error);
      alert('Error marking group as paid');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white rounded-lg font-bold text-base shadow-md transition active:scale-95"
      >
        {label}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Mark Group as Paid
            </h2>

            <p className="text-gray-700 dark:text-gray-300 mb-6">
              This will mark the entire group payment as complete. All group members will have payment snapshots created with their current unpaid amounts.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setIsOpen(false)}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkGroupAsPaid}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
