'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';

interface MarkAsPaidButtonProps {
  month: string;
  label: string;
}

export default function MarkAsPaidButton({ month, label }: MarkAsPaidButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleMarkAsPaid = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/month', {
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
        console.error('Failed to mark as paid');
      }
    } catch (error) {
      console.error('Error marking as paid:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleMarkAsPaid}
      disabled={isLoading}
      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? 'Marking...' : label}
    </button>
  );
}
