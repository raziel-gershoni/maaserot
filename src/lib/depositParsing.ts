import { addDays, israelDate, isRealDate, toYmd } from './israelTime';

/**
 * Turning what the model read off a bank screen into candidate incomes.
 *
 * Pure, and deliberately strict. The model is asked to copy amounts exactly as
 * shown, so this is where bank-app formatting is undone: bidi marks, NBSPs,
 * the many spellings of the shekel sign, and a +/− the app may put at either
 * end in RTL. Anything that does not normalise to a well-formed amount is
 * dropped rather than guessed at; the user can always type the amount.
 */

export type Direction = 'in' | 'out' | 'unknown';

/** One line as the model transcribed it. Nothing here is trusted yet. */
export interface RawTransaction {
  amountText: string;
  direction: Direction;
  currency: 'ILS' | 'other';
  day: number | null;
  month: number | null;
  year: number | null;
  relativeDay: 'today' | 'yesterday' | null;
  description: string;
}

export interface Reading {
  isBankScreen: boolean;
  transactions: RawTransaction[];
}

export interface Candidate {
  /** Agorot. */
  amount: number;
  /** 'YYYY-MM-DD', Israeli calendar. */
  date: string;
  /** 'YYYY-MM' of `date`. */
  month: string;
  /** False when the screen showed no usable date and the sent day stood in. */
  dateFromImage: boolean;
  description: string;
  /** The model could not tell whether the line was incoming; the card warns. */
  directionUnknown: boolean;
}

/** The picker shows at most this many; beyond it the user is told some were left out. */
export const MAX_CANDIDATES = 8;
/** ₪10,000,000. Anything larger is a misread, not a salary. */
export const MAX_AGOROT = 1_000_000_000;

const SPACES = /\p{Zs}/gu;
// LRM, RLM, ALM, the embeddings/overrides and the isolates, and a stray BOM:
// the marks bank apps scatter around numbers to keep them LTR inside Hebrew.
const BIDI = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069\ufeff]/g;
// The shekel as banks write it: the sign, the abbreviation with an ASCII
// double quote, with gershayim (U+05F4), with two apostrophes or two gereshes
// (U+05F3), and the Latin codes. Removed before spaces so `\b` still sees
// "ILS 100" as a word.
const CURRENCY = /₪|ש"ח|ש״ח|ש''ח|ש׳׳ח|\bNIS\b|\bILS\b/giu;
// Hyphen-minus, the minus sign, figure dash through horizontal bar, small hyphen-minus.
const MINUS = /[-\u2212\u2012-\u2015\ufe63]/;
// Thousands groups of exactly three, or none at all; at most two decimals.
// "12,34" and "12.345" are ambiguous between locales, so they are refused.
const SHAPE = /^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;

/**
 * Agorot, or null. Used for the model's transcriptions and for amounts the
 * user types, so both go through the same rules.
 */
export function parseAmount(text: string, direction: Direction): number | null {
  let s = text.replace(BIDI, '').replace(CURRENCY, '').replace(SPACES, '');
  const leading = s[0], trailing = s[s.length - 1];
  const signAtStart = leading === '+' || (leading !== undefined && MINUS.test(leading));
  const signAtEnd = s.length > 1 && (trailing === '+' || MINUS.test(trailing));
  if (signAtStart && signAtEnd) return null;
  const sign = signAtStart ? leading : signAtEnd ? trailing : null;
  if (sign !== null) {
    if (sign !== '+') return null;           // any minus: money going out
    if (direction === 'out') return null;    // a + on an outgoing line is contradictory
    s = signAtStart ? s.slice(1) : s.slice(0, -1);
  }
  if (!SHAPE.test(s)) return null;
  // Whole shekels and agorot are converted separately, so no float ever holds
  // a fractional amount.
  const [whole, frac = ''] = s.replace(/,/g, '').split('.');
  const agorot = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(agorot) || agorot < 1 || agorot > MAX_AGOROT) return null;
  return agorot;
}

/**
 * The deposit's Israeli calendar date. Tomorrow is allowed because banks show
 * the value date, which can be the next business day. A date the screen does
 * not give, or gives impossibly, becomes the day the screenshot was sent, and
 * `dateFromImage` says so, so the card can tell the user.
 *
 * All comparisons are on 'YYYY-MM-DD' strings, which order like dates.
 */
export function resolveDate(
  parts: Pick<RawTransaction, 'day' | 'month' | 'year' | 'relativeDay'>,
  sentAt: Date
): { date: string; dateFromImage: boolean } {
  const today = israelDate(sentAt);
  const tomorrow = addDays(today, 1);
  const missing = { date: today, dateFromImage: false };
  if (parts.relativeDay === 'today') return { date: today, dateFromImage: true };
  if (parts.relativeDay === 'yesterday') return { date: addDays(today, -1), dateFromImage: true };
  const { day, month } = parts;
  if (day == null || month == null) return missing;
  if (parts.year != null) {
    const y = parts.year >= 0 && parts.year < 100 ? parts.year + 2000 : parts.year;
    // A misread year like 126 or 19999 is a real date to Date.UTC, and as a
    // string it still sorts before tomorrow; it must not become a month.
    if (y < 1000 || y > 9999 || !isRealDate(y, month, day)) return missing;
    const date = toYmd(y, month, day);
    return date <= tomorrow ? { date, dateFromImage: true } : missing;
  }
  // No year on screen: the latest of last, this or next year that is not
  // after tomorrow. Next year only ever wins for 01/01 seen on 31 Dec.
  const Y = Number(today.slice(0, 4));
  for (const y of [Y + 1, Y, Y - 1]) {
    if (!isRealDate(y, month, day)) continue;
    const date = toYmd(y, month, day);
    if (date <= tomorrow) return { date, dateFromImage: true };
  }
  return missing;
}

/**
 * The lines worth offering as an income, in screen order. Outgoing and
 * foreign-currency lines are dropped; lines the model could not place are
 * kept but flagged, since a salary the model was unsure about is still the
 * likeliest thing the user sent.
 */
export function toCandidates(
  reading: Reading,
  sentAt: Date
): { candidates: Candidate[]; truncated: boolean } {
  const all: Candidate[] = [];
  for (const t of reading.transactions) {
    if (t.direction === 'out' || t.currency !== 'ILS') continue;
    const amount = parseAmount(t.amountText, t.direction);
    if (amount === null) continue;
    const { date, dateFromImage } = resolveDate(t, sentAt);
    all.push({
      amount,
      date,
      month: date.slice(0, 7),
      dateFromImage,
      description: t.description.trim(),
      directionUnknown: t.direction === 'unknown',
    });
  }
  return { candidates: all.slice(0, MAX_CANDIDATES), truncated: all.length > MAX_CANDIDATES };
}
