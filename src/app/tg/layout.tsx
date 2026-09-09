import Script from 'next/script';
import type { Metadata, Viewport } from 'next';
import { fontVariables } from '@/lib/fonts';
import '../globals.css';

/**
 * The Telegram Mini App shell.
 *
 * It sits outside the `[locale]` segment — middleware must not touch this URL,
 * because the redirect would drop the `#tgWebAppData` fragment that carries
 * initData — so it cannot inherit the locale layout and has to declare its own
 * document head, fonts and metadata.
 *
 * `dir="rtl"` is the Hebrew-first default; the page re-stamps `lang`/`dir` on
 * the client once Telegram tells us the viewer's language.
 */
export const metadata: Metadata = {
  title: 'Maaserot - מעשרות',
  description: 'Track your maaser (charity) obligations and payments',
  applicationName: 'Maaserot',
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192x192.png',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#D47A5C' },
    { media: '(prefers-color-scheme: dark)', color: '#E08C6E' },
  ],
};

export default function TelegramMiniAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className={`h-full ${fontVariables}`}>
      <body className="antialiased h-full bg-canvas text-ink">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
