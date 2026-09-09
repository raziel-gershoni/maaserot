'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export default function RefreshButton() {
  const t = useTranslations('common');
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const label = t('refresh');

  return (
    <Button
      variant="ghost"
      icon
      onClick={handleRefresh}
      aria-label={label}
      aria-busy={isRefreshing || undefined}
      title={label}
      className="rounded-full"
    >
      {/* A refresh loop is not a directional arrow — it must not mirror. */}
      <svg
        className={cn('h-5 w-5', isRefreshing && 'animate-spin')}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </Button>
  );
}
