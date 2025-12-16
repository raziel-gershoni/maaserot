import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import { logout } from '@/app/actions/auth';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import LocaleSync from '@/components/LocaleSync';
import BottomNav from '@/components/BottomNav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const t = await getTranslations('common');

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 pb-16 lg:pb-0">
      <LocaleSync />
      {/* Navigation Header */}
      <header className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo/App Name */}
            <Link href="/dashboard" className="flex items-center">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('appName')}</h1>
            </Link>

            {/* Mobile: Settings Link */}
            <Link
              href="/settings"
              className="lg:hidden p-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>

            {/* Desktop Navigation Links - Hidden on mobile */}
            <nav className="hidden lg:flex gap-2 xl:gap-4">
              <Link
                href="/dashboard"
                className="px-3 xl:px-4 py-2 text-sm xl:text-base text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition"
              >
                {t('dashboard')}
              </Link>
              <Link
                href="/income"
                className="px-3 xl:px-4 py-2 text-sm xl:text-base text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition"
              >
                {t('income')}
              </Link>
              <Link
                href="/charities"
                className="px-3 xl:px-4 py-2 text-sm xl:text-base text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition"
              >
                {t('charities')}
              </Link>
              <Link
                href="/history"
                className="px-3 xl:px-4 py-2 text-sm xl:text-base text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition"
              >
                {t('history')}
              </Link>
              <Link
                href="/partnership"
                className="px-3 xl:px-4 py-2 text-sm xl:text-base text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition"
              >
                {t('partnership')}
              </Link>
              <Link
                href="/settings"
                className="px-3 xl:px-4 py-2 text-sm xl:text-base text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition"
              >
                {t('settings')}
              </Link>
            </nav>

            {/* Desktop User Menu - Hidden on mobile */}
            <div className="hidden lg:flex items-center gap-2 xl:gap-4">
              <LanguageSwitcher />
              <span className="hidden xl:inline text-sm text-gray-700 dark:text-gray-300 truncate max-w-[150px]">{session.user.email}</span>
              <form action={logout}>
                <button
                  type="submit"
                  className="px-3 xl:px-4 py-2 text-sm xl:text-base bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white rounded-lg font-medium transition"
                >
                  {t('logout')}
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main>{children}</main>

      {/* Bottom Navigation - Mobile only */}
      <BottomNav />
    </div>
  );
}
