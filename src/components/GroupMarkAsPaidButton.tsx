'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';

interface GroupMarkAsPaidButtonProps {
  month: string;
  label: string;
}

export default function GroupMarkAsPaidButton({ month, label }: GroupMarkAsPaidButtonProps) {
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
        router.refresh();
      } else {
        console.error('Failed to mark group as paid');
      }
    } catch (error) {
      console.error('Error marking group as paid:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleMarkGroupAsPaid}
      disabled={isLoading}
      className="px-6 py-3 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white rounded-lg font-bold text-base shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? 'Marking Group...' : label}
    </button>
  );
}
