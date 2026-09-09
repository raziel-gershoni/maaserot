'use client';

import type { ReactNode } from 'react';
import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * The app's primary navigation, in its two presentations.
 *
 * Both are built from one list and one active treatment, so the bottom bar and
 * the desktop header cannot drift into two different information
 * architectures again. Settings and logout live in the account menu at every
 * width, so both bars carry exactly the same five destinations.
 */

interface NavItem {
  href: string;
  /** Bottom-bar label. Short enough to sit in a fifth of a 360px screen. */
  short: string;
  /** Header label. The full name, where there is room for it. */
  full: string;
  icon: ReactNode;
}

const ICON = {
  className: 'h-5 w-5',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
} as const;

function useNavItems(): NavItem[] {
  const t = useTranslations('common');

  return [
    {
      href: '/dashboard',
      short: t('navDashboard'),
      full: t('dashboard'),
      icon: (
        <svg {...ICON}>
          <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      href: '/income',
      short: t('income'),
      full: t('income'),
      icon: (
        <svg {...ICON}>
          <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      href: '/charities',
      short: t('navCharities'),
      full: t('charities'),
      icon: (
        <svg {...ICON}>
          <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
    },
    {
      href: '/history',
      short: t('history'),
      full: t('history'),
      icon: (
        <svg {...ICON}>
          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      href: '/partnership',
      short: t('partnership'),
      full: t('partnership'),
      icon: (
        <svg {...ICON}>
          <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
  ];
}

function useIsActive() {
  const pathname = usePathname();

  return (href: string) => {
    // Strip the locale prefix so /he/income and /en/income both match.
    const cleanPath = pathname.replace(/^\/(he|en)/, '');
    return cleanPath === href || cleanPath.startsWith(href + '/');
  };
}

/** The desktop header nav. Same destinations, same active pill. */
export function HeaderNav({ className }: { className?: string }) {
  const t = useTranslations('common');
  const items = useNavItems();
  const isActive = useIsActive();

  return (
    <nav aria-label={t('mainNav')} className={cn('items-center gap-1', className)}>
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-control px-3 py-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-brand-soft text-brand-soft-ink'
                : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
            )}
          >
            {item.full}
          </Link>
        );
      })}
    </nav>
  );
}

export default function BottomNav() {
  const t = useTranslations('common');
  const items = useNavItems();
  const isActive = useIsActive();

  return (
    <nav
      aria-label={t('mainNav')}
      className="safe-area-inset-bottom fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface lg:hidden"
    >
      <ul className="mx-auto flex w-full max-w-5xl items-stretch px-1">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex min-h-16 w-full flex-col items-center justify-center gap-1 px-0.5 py-2',
                  'transition-colors',
                  active ? 'text-brand-soft-ink' : 'text-ink-muted hover:text-ink'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-11 shrink-0 items-center justify-center rounded-full transition-colors',
                    active
                      ? 'bg-brand-soft'
                      : 'group-hover:bg-surface-sunken'
                  )}
                >
                  {item.icon}
                </span>
                <span
                  className={cn(
                    'line-clamp-2 w-full text-center text-[0.6875rem] leading-tight break-words',
                    active ? 'font-semibold' : 'font-medium'
                  )}
                >
                  {item.short}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
