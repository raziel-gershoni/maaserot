import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import { logout } from '@/app/actions/auth';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import LocaleSync from '@/components/LocaleSync';
import MobileNav from '@/components/MobileNav';

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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <LocaleSync />
      {/* Navigation Header */}
      <header className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo/App Name */}
            <Link href="/dashboard" className="flex items-center">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('appName')}</h1>
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
                href="/shared"
                className="px-3 xl:px-4 py-2 text-sm xl:text-base text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition"
              >
                {t('shared')}
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

            {/* Mobile Navigation */}
            <MobileNav userEmail={session.user.email || ''} />
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main>{children}</main>
    </div>
  );
}
