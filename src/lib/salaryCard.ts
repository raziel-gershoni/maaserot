import { createTranslator } from 'next-intl';
import he from '../../messages/he.json';
import en from '../../messages/en.json';
import { formatCurrency, maaserFor } from './calculations';
import { MAX_CANDIDATES, MAX_MONTHS_BACK, type Candidate } from './depositParsing';
import { addDays, addMonths } from './israelTime';
import type { InlineButton, OutgoingMessage } from './telegramBot';

/**
 * Everything the bot says, and the buttons it says it with.
 *
 * Pure: it turns a view of a pending income into Telegram text and keyboards,
 * and touches neither the database nor Telegram. Three things live here:
 *
 *  - Bidi. A card mixes Hebrew, numbers, ₪ and whatever the bank called the
 *    deposit. Every Hebrew line starts with an RLM, so a line that opens with
 *    an amount or a glyph still reads right to left. Text we did not write (a
 *    description, a partner's name) is isolated, so its own direction cannot
 *    reorder the line around it. Glyphs and arrows live in the message
 *    strings, so each locale points them its own way.
 *  - callback_data. Every button carries the row id and the version the card
 *    was rendered at, so a tap on a card that has since changed is caught
 *    rather than acted on. Anyone can send any callback_data, so decoding is
 *    strict, and the caller checks the result again against the row.
 *  - Strings. All of them come from the `bot` namespace of messages/*.json,
 *    through next-intl's createTranslator, which needs no request.
 */

export type Locale = 'he' | 'en';
export type BotNoticeKey = keyof typeof he.bot.notice;
export type BotToastKey = keyof typeof he.bot.toast;

// Typed as the Hebrew file, so an English file missing a key fails to compile.
const MESSAGES: Record<Locale, typeof he> = { he, en };

function makeTranslator(locale: Locale) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: 'bot' });
}

const TRANSLATORS = { he: makeTranslator('he'), en: makeTranslator('en') };

// ---------------------------------------------------------------------------
// callback_data
// ---------------------------------------------------------------------------

export type CallbackAction = 'p' | 'm' | 'a' | 'A' | 'c' | 'l';
export interface CallbackData { action: CallbackAction; id: string; version: number; arg?: string }

const ACTIONS = new Set<string>(['p', 'm', 'a', 'A', 'c', 'l']);
const ID = /^c[a-z0-9]{20,32}$/;
// At most 6 digits, written the one way encodeCallback writes it.
const VERSION = /^(0|[1-9]\d{0,5})$/;
const INDEX = /^[0-7]$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const isAction = (s: string): s is CallbackAction => ACTIONS.has(s);

/** `si:<action>:<id>:<version>[:<arg>]`: 45 bytes at most with a cuid, under Telegram's 64. */
export function encodeCallback(d: CallbackData): string {
  return `si:${d.action}:${d.id}:${d.version}` + (d.arg !== undefined ? `:${d.arg}` : '');
}

/**
 * The tap, or null for anything encodeCallback could not have written. A
 * month's bounds depend on the current time, so `m` is checked here only for
 * shape; the caller applies `isAllowedMonth`.
 */
export function decodeCallback(data: string | undefined): CallbackData | null {
  if (!data) return null;
  const [prefix, action, id, version, arg, ...rest] = data.split(':');
  if (rest.length > 0 || prefix !== 'si' || !isAction(action)) return null;
  if (!ID.test(id ?? '') || !VERSION.test(version ?? '')) return null;
  const argPattern = action === 'p' ? INDEX : action === 'm' ? MONTH : null;
  if (argPattern ? arg === undefined || !argPattern.test(arg) : arg !== undefined) return null;
  return { action, id, version: Number(version), ...(arg !== undefined && { arg }) };
}

/**
 * The months a card may file into. `resolveDate` stops at the same
 * `MAX_MONTHS_BACK`, so a card never starts on a month its buttons could not
 * reach. Never a future month.
 */
export function monthBounds(currentMonth: string): { min: string; max: string } {
  return { min: addMonths(currentMonth, -MAX_MONTHS_BACK), max: currentMonth };
}

export function isAllowedMonth(month: string, currentMonth: string): boolean {
  const { min, max } = monthBounds(currentMonth);
  return MONTH.test(month) && month >= min && month <= max;
}

function callbackButton(text: string, d: CallbackData): InlineButton {
  return { text, callback_data: encodeCallback(d) };
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const RLM = '\u200f';
// Embeddings, overrides and isolates. Left in, one could close our isolate
// early, or open one of its own that swallows our closing mark.
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/g;
const MAX_QUOTED = 40;

/** Cut to `max` code points, so a surrogate pair is never split. */
function truncate(s: string, max: number): string {
  const chars = [...s];
  return chars.length > max ? chars.slice(0, max).join('') + '…' : s;
}

const isolate = (s: string) => '\u2068' + s + '\u2069';

/** Text we did not write: cut first, so the isolate always closes. */
const quote = (s: string) => isolate(truncate(s.replace(BIDI_CONTROLS, ''), MAX_QUOTED));

/** A message from its lines; a string may hold several. */
function compose(locale: Locale, lines: string[], keyboard?: InlineButton[][]): OutgoingMessage {
  const all = lines.join('\n').split('\n');
  const text = (locale === 'he' ? all.map((l) => RLM + l) : all).join('\n');
  return keyboard ? { text, replyMarkup: { inline_keyboard: keyboard } } : { text };
}

/** 'YYYY-MM-DD' → '10.10.2026', day first, as Israeli banks write it. */
const fullDate = (ymd: string) => ymd.split('-').reverse().join('.');
const dayAndMonth = (ymd: string) => fullDate(ymd).slice(0, 5);

/** Whole calendar months from one 'YYYY-MM' to another. */
function monthsApart(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * "October 2026" / "אוקטובר 2026"; short is "Oct 2026". The year stays in
 * the short form too: a card spans 24 months, and "Dec" seen in January is
 * ambiguous. Formatted in UTC from a UTC date, so the label is the month
 * itself whatever the server's time zone.
 */
export function monthLabel(month: string, locale: Locale, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    month: style,
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** What a deposit is called when the screen gave it no name, or there was no screen. */
export function defaultDescription(locale: Locale): string {
  return TRANSLATORS[locale]('defaultDescription');
}

/** The account's language; for a sender with no account, Telegram's (`en*` is English). */
export function localeFor(user: { locale?: string | null } | null, languageCode?: string): Locale {
  if (user?.locale === 'he' || user?.locale === 'en') return user.locale;
  return languageCode?.toLowerCase().startsWith('en') ? 'en' : 'he';
}

// ---------------------------------------------------------------------------
// The card and the picker
// ---------------------------------------------------------------------------

export interface CardView {
  locale: Locale; id: string; version: number;
  amount: number; month: string; depositDate: string; dateFromImage: boolean;
  description: string; percentage: number; directionUnknown: boolean;
  today: string; currentMonth: string; hasOtherCandidates: boolean;
  duplicate: { name: string | null; month: string; amount: number } | null; // name null = you
  otherOpenSameAmount: boolean; monthPaid: boolean; saveFailed?: boolean;
}

export interface PickerView { locale: Locale; id: string; version: number; candidates: Candidate[]; truncated: boolean }

/** Further back than this, the year was probably misread, or it is not this salary. */
const OLD_DATE_DAYS = 40;

export function renderCard(v: CardView): OutgoingMessage {
  const t = TRANSLATORS[v.locale];
  const money = (agorot: number) => formatCurrency(agorot, v.locale);
  const month = monthLabel(v.month, v.locale);
  // The value approve records, so the card promises exactly what is saved.
  const maaser = money(maaserFor(v.amount, v.percentage));

  const lines = [
    t('card.title', { description: quote(v.description) }),
    t('card.deposited', { amount: money(v.amount), date: fullDate(v.depositDate) }),
    t('card.fileTo', { month, percent: v.percentage, maaser }),
  ];
  const dup = v.duplicate;
  if (dup) {
    const values = { amount: money(dup.amount), month: monthLabel(dup.month, v.locale) };
    lines.push(dup.name === null
      ? t('card.warnDuplicateSelf', values)
      : t('card.warnDuplicatePartner', { ...values, name: quote(dup.name) }));
  }
  if (v.otherOpenSameAmount) lines.push(t('card.warnOtherOpen', { amount: money(v.amount), month }));
  if (v.monthPaid) lines.push(t('card.warnPaid', { month, maaser }));
  if (v.depositDate < addDays(v.today, -OLD_DATE_DAYS)) {
    lines.push(t('card.warnOldDate', { months: monthsApart(v.depositDate.slice(0, 7), v.today.slice(0, 7)) }));
  }
  if (v.directionUnknown) lines.push(t('card.warnDirection'));
  if (!v.dateFromImage) lines.push(t('card.infoNoDate'));
  if (v.saveFailed) lines.push(t('card.saveFailed'));
  lines.push(t('card.hintReply'));

  const tap = (text: string, action: CallbackAction, arg?: string) =>
    callbackButton(text, { action, id: v.id, version: v.version, arg });

  // Once a duplicate has been shown, ✅ means "I saw it": `A` skips the check.
  const keyboard = [[dup ? tap(t('card.addAnyway'), 'A') : tap(t('card.add'), 'a')]];

  const earlier = addMonths(v.month, -1);
  const later = addMonths(v.month, 1);
  const months: InlineButton[] = [];
  if (earlier >= monthBounds(v.currentMonth).min) {
    months.push(tap(t('card.earlier', { month: monthLabel(earlier, v.locale, 'short') }), 'm', earlier));
  }
  if (v.month < v.currentMonth) {
    months.push(tap(t('card.later', { month: monthLabel(later, v.locale, 'short') }), 'm', later));
  }
  // Time runs right to left in Hebrew: the earlier month goes on the right.
  if (months.length > 0) keyboard.push(v.locale === 'he' ? months.reverse() : months);
  if (Math.abs(monthsApart(v.month, v.currentMonth)) > 1) {
    keyboard.push([tap(t('card.jump', { month: monthLabel(v.currentMonth, v.locale) }), 'm', v.currentMonth)]);
  }
  if (v.hasOtherCandidates) keyboard.push([tap(t('card.back'), 'l')]);
  keyboard.push([tap(t('card.cancel'), 'c')]);

  return compose(v.locale, lines, keyboard);
}

export function renderPicker(v: PickerView): OutgoingMessage {
  const t = TRANSLATORS[v.locale];
  const lines = [t('picker.title')];
  const keyboard: InlineButton[][] = [];
  v.candidates.forEach((c, i) => {
    const values = { n: i + 1, amount: formatCurrency(c.amount, v.locale), date: dayAndMonth(c.date) };
    lines.push(t('picker.line', {
      ...values,
      // A screen line with no description is stored as '' (spec Rules → Description).
      description: quote(c.description || defaultDescription(v.locale)),
      unknown: c.directionUnknown ? 'yes' : 'no',
    }));
    keyboard.push([callbackButton(t('picker.button', values), { action: 'p', id: v.id, version: v.version, arg: String(i) })]);
  });
  if (v.truncated) lines.push(t('picker.truncated', { count: MAX_CANDIDATES }));
  keyboard.push([callbackButton(t('card.cancel'), { action: 'c', id: v.id, version: v.version })]);
  return compose(v.locale, lines, keyboard);
}

// ---------------------------------------------------------------------------
// Final states and one-off messages. None of them has a callback button left.
// ---------------------------------------------------------------------------

export function renderReading(locale: Locale): OutgoingMessage {
  return renderNotice(locale, 'reading');
}

export function renderAdded(v: {
  locale: Locale; amount: number; description: string; month: string;
  percentage: number; leftToPay: number; appUrl: string;
}): OutgoingMessage {
  const t = TRANSLATORS[v.locale];
  const money = (agorot: number) => formatCurrency(agorot, v.locale);
  const text = t('final.added', {
    amount: money(v.amount),
    description: quote(v.description),
    month: monthLabel(v.month, v.locale),
    percent: v.percentage,
    maaser: money(maaserFor(v.amount, v.percentage)),
    left: money(v.leftToPay),
  });
  return compose(v.locale, [text], [[{ text: t('button.openApp'), web_app: { url: v.appUrl } }]]);
}

/** A row cancelled before an amount was chosen (a picker, a failed read) has none to show. */
export function renderCancelled(v: { locale: Locale; amount: number | null }): OutgoingMessage {
  const text = TRANSLATORS[v.locale]('final.cancelled', v.amount === null
    ? { hasAmount: 'no', amount: '' }
    : { hasAmount: 'yes', amount: formatCurrency(v.amount, v.locale) });
  return compose(v.locale, [text]);
}

export function renderExpired(locale: Locale): OutgoingMessage {
  return compose(locale, [TRANSLATORS[locale]('final.expired')]);
}

/** What a superseded card becomes, so only the newest one has buttons. */
export function renderUpdatedPointer(locale: Locale): OutgoingMessage {
  return compose(locale, [TRANSLATORS[locale]('final.updated')]);
}

export function renderNotice(
  locale: Locale,
  key: BotNoticeKey,
  values?: Record<string, string>,
  button?: { kind: 'app'; url: string; label?: 'openApp' | 'openAppTg' }
): OutgoingMessage {
  const t = TRANSLATORS[locale];
  const keyboard = button && [[{ text: t(`button.${button.label ?? 'openApp'}`), web_app: { url: button.url } }]];
  return compose(locale, [t(`notice.${key}`, values)], keyboard);
}

/** The one answer a tap gets (answerCallbackQuery's `text`). */
export function toastText(locale: Locale, key: BotToastKey): string {
  return compose(locale, [TRANSLATORS[locale](`toast.${key}`)]).text;
}
