'use server';

import { signOut } from '@/lib/auth';
import { getLocale } from 'next-intl/server';

export async function logout() {
  const locale = await getLocale();
  await signOut({ redirectTo: `/${locale}/login` });
}
