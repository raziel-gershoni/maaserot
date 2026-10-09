/**
 * Calendar arithmetic in Israel time.
 *
 * The server clock is UTC on Vercel, so "this month" computed from it is the
 * previous month for two or three hours around every month boundary. Every
 * date the app shows or files by is an Israeli calendar date, so everything
 * goes through here. Intl does the time-zone work; nothing assumes a fixed
 * offset, because Israel switches between UTC+2 and UTC+3. The one way a
 * month is named for a user lives here too, free of any other dependency.
 */

const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function israelDate(instant: Date): string {
  const parts = Object.fromEntries(PARTS.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function israelMonth(instant: Date): string {
  return israelDate(instant).slice(0, 7);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar-day arithmetic on 'YYYY-MM-DD'. UTC here is only a calculator. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

export function isRealDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function toYmd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * How a month is named to a user, in the spec's three forms:
 *  - 'long', "October 2026" / "אוקטובר 2026": the first mention in a message.
 *  - 'name', "October" / "אוקטובר": a later mention in a message whose first
 *    mention already gave the year ("Left to pay for October").
 *  - 'short', "Oct" / "אוק׳": a card's earlier and later buttons. They sit
 *    under a line that names the card's month and year and are one month
 *    either side of it, so a year would only widen them.
 * Formatted in UTC from a UTC date, so the label is the month itself whatever
 * the server's time zone. The bot's cards and the partner notifications both
 * name months through this one function, so they agree.
 */
export function monthLabel(month: string, locale: string, style: 'long' | 'name' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    month: style === 'short' ? 'short' : 'long',
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}
