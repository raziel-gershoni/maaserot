'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { logout } from '@/app/actions/auth';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Button, buttonStyles, Dialog, SectionRule } from '@/components/ui';

/**
 * Everything that is not a destination: who you are, the language, the way
 * out. It opens at every width, which is what makes the mobile header a peer
 * of the desktop one rather than a reduced version of it — before this,
 * logging out and switching language were desktop-only.
 *
 * Built on <Dialog>, so it lands as a sheet on a phone and a small centred
 * panel on a desktop, with the focus trap, Esc and scroll lock already solved.
 */
export default function AccountMenu({
  email,
  name,
}: {
  email?: string | null;
  name?: string | null;
}) {
  const t = useTranslations('common');
  const tSettings = useTranslations('settings');
  // The single Link inside the sheet closes it on click, so there is no need
  // to watch the pathname.
  const [open, setOpen] = useState(false);

  const initial = (name?.trim() || email?.trim() || '').charAt(0).toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('account')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-sunken font-display text-sm font-bold text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        {initial ? (
          <span aria-hidden="true" className="bidi-isolate">
            {initial}
          </span>
        ) : (
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 21v-1a6 6 0 00-6-6h-4a6 6 0 00-6 6v1M16 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('account')}
        description={
          email ? (
            <span className="bidi-isolate break-all">{email}</span>
          ) : undefined
        }
        size="sm"
        closeLabel={t('close')}
        footer={
          <form action={logout}>
            <Button type="submit" variant="danger" fullWidth>
              {t('logout')}
            </Button>
          </form>
        }
      >
        <div className="space-y-5">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={buttonStyles({ variant: 'secondary', fullWidth: true })}
          >
            <svg
              className="h-5 w-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('settings')}
          </Link>

          <div>
            <SectionRule>{tSettings('language')}</SectionRule>
            <div className="mt-3">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
