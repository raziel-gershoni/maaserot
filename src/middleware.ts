import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextRequest } from 'next/server';

const middleware = createMiddleware(routing);

export default function localeMiddleware(request: NextRequest) {
  // Check for locale cookie
  const localeCookie = request.cookies.get('NEXT_LOCALE');

  // If cookie exists and is different from URL locale, redirect
  if (localeCookie?.value) {
    const urlLocale = request.nextUrl.pathname.split('/')[1];
    if (urlLocale !== localeCookie.value && ['he', 'en'].includes(localeCookie.value)) {
      const newUrl = request.nextUrl.clone();
      newUrl.pathname = newUrl.pathname.replace(`/${urlLocale}`, `/${localeCookie.value}`);
      return Response.redirect(newUrl);
    }
  }

  return middleware(request);
}

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(he|en)/:path*']
};
