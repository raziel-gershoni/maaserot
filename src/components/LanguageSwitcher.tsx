'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { useTransition, useState } from 'react';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('settings');
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);

  const switchLocale = async (newLocale: 'he' | 'en') => {
    setIsSaving(true);

    // Set cookie for middleware to use
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`; // 1 year

    // Save language preference to database
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: newLocale }),
      });
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }

    // Switch language in UI
    startTransition(() => {
      router.replace(pathname, { locale: newLocale });
    });

    setIsSaving(false);
  };

  const busy = isPending || isSaving;

  // The current language is not clickable, but it must not look disabled —
  // it is the selected pill, which is the loudest thing in the control.
  const pill = (active: boolean) =>
    cn(
      'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
      'disabled:cursor-default',
      active
        ? 'bg-surface text-ink shadow-card'
        : 'text-ink-muted hover:text-ink'
    );

  return (
    <div
      role="group"
      aria-label={t('language')}
      className="relative inline-flex items-center gap-1 rounded-full border border-line bg-surface-sunken p-1"
    >
      {isSaving && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-surface-sunken/80">
          <Spinner size="sm" className="text-ink-muted" />
        </span>
      )}
      <button
        type="button"
        onClick={() => switchLocale('he')}
        disabled={busy || locale === 'he'}
        aria-pressed={locale === 'he'}
        lang="he"
        className={pill(locale === 'he')}
      >
        עב
      </button>
      <button
        type="button"
        onClick={() => switchLocale('en')}
        disabled={busy || locale === 'en'}
        aria-pressed={locale === 'en'}
        lang="en"
        className={cn(pill(locale === 'en'), 'bidi-isolate')}
      >
        EN
      </button>
    </div>
  );
}
