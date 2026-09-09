import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import LanguageSwitcher from '@/components/LanguageSwitcher';

/**
 * The shell every auth screen sits in.
 *
 * Login, register, verify-email and verify/[token] each carried their own copy
 * of this header + centred column, which is why the four of them drifted apart.
 * One shell now: the lockup and the language switcher are rendered once here,
 * and each page contributes only its card.
 */
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations('common');

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="px-4 pt-5 sm:pt-8">
        <div className="mx-auto flex w-full max-w-md flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand text-brand-ink shadow-card"
            >
              {/* A whole, and the portion measured out of it. */}
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="8.25" />
                <path d="M12 3.75V12l7.15 4.13" />
              </svg>
            </span>
            <span className="truncate font-display text-lg font-bold tracking-tight text-ink">
              {t('appName')}
            </span>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center sm:pb-16 sm:pt-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
