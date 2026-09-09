import { redirect } from 'next/navigation';
import { routing } from '@/i18n/routing';

/**
 * `/` never renders: the next-intl middleware matches it and rewrites to the
 * default locale first. This is the fallback for anything that reaches the
 * route directly (a prefetch, a bypassed middleware matcher), so it does the
 * same thing the middleware does instead of shipping a page of its own.
 */
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`);
}
