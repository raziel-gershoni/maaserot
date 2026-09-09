import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import AccountMenu from '@/components/AccountMenu';
import LocaleSync from '@/components/LocaleSync';
import BottomNav, { HeaderNav } from '@/components/BottomNav';
import RefreshButton from '@/components/RefreshButton';

/**
 * One shell for both widths.
 *
 * The header and the page content share a single container (max-w-5xl), so a
 * heading lines up with the app name above it instead of drifting apart past
 * 1024px. Destinations live in the nav — the same five in the bottom bar and
 * in the header — and everything else (language, settings, logout) lives in
 * the account menu, which is now reachable on a phone.
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [session, { locale }] = await Promise.all([auth(), params]);

  if (!session?.user?.id) {
    // localePrefix is 'always', so an unprefixed /login is a 404.
    redirect(`/${locale}/login`);
  }

  const t = await getTranslations('common');

  return (
    <div className="flex min-h-screen flex-col bg-canvas pb-20 lg:pb-0">
      <LocaleSync />

      <header className="safe-area-inset-top relative z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-2 px-4 sm:px-6">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 rounded-control"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand"
            >
              {/* A circle with a tenth of it filled — the maaser itself. */}
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 12V3a9 9 0 0 1 5.29 1.72Z" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-ink sm:text-xl">
              {t('appName')}
            </span>
          </Link>

          <HeaderNav className="ms-4 hidden lg:flex" />

          <div className="ms-auto flex shrink-0 items-center gap-1">
            <RefreshButton />
            <AccountMenu email={session.user.email} name={session.user.name} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1">{children}</main>

      <BottomNav />
    </div>
  );
}
