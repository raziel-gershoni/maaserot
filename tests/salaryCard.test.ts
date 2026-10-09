import { describe, expect, it } from 'vitest';
import { formatCurrency, maaserFor } from '@/lib/calculations';
import type { InlineButton, OutgoingMessage } from '@/lib/telegramBot';
import {
  decodeCallback,
  defaultDescription,
  encodeCallback,
  isAllowedMonth,
  localeFor,
  monthBounds,
  monthLabel,
  renderAdded,
  renderCancelled,
  renderCard,
  renderExpired,
  renderNotice,
  renderPicker,
  renderReading,
  renderUpdatedPointer,
  toastText,
  type CallbackData,
  type CardView,
  type PickerView,
} from '@/lib/salaryCard';

const ID = 'c' + 'a'.repeat(24); // a realistic cuid
const RLM = '\u200f', FSI = '\u2068', PDI = '\u2069';

const card = (patch: Partial<CardView> = {}): CardView => ({
  locale: 'en',
  id: ID,
  version: 3,
  amount: 1234567,
  month: '2026-10',
  depositDate: '2026-10-08',
  dateFromImage: true,
  description: 'ACME payroll',
  percentage: 10,
  directionUnknown: false,
  today: '2026-10-09',
  currentMonth: '2026-10',
  hasOtherCandidates: false,
  duplicate: null,
  otherOpenSameAmount: false,
  monthPaid: false,
  ...patch,
});

const buttons = (msg: OutgoingMessage): InlineButton[] => msg.replyMarkup?.inline_keyboard.flat() ?? [];
const taps = (msg: OutgoingMessage) => buttons(msg).map((b) => decodeCallback(b.callback_data));
const monthTargets = (msg: OutgoingMessage) =>
  taps(msg).filter((d) => d?.action === 'm').map((d) => d!.arg);
const monthRow = (msg: OutgoingMessage) =>
  msg.replyMarkup!.inline_keyboard.find((row) =>
    row.length === 2 && row.every((b) => decodeCallback(b.callback_data)?.action === 'm')
  );

describe('callback data', () => {
  const cases: CallbackData[] = [
    { action: 'p', id: ID, version: 123456, arg: '7' },
    { action: 'm', id: ID, version: 123456, arg: '2026-10' },
    { action: 'a', id: ID, version: 123456 },
    { action: 'A', id: ID, version: 123456 },
    { action: 'c', id: ID, version: 123456 },
    { action: 'l', id: ID, version: 123456 },
  ];

  it.each(cases)('round-trips $action within Telegram\'s 64 bytes', (d) => {
    const encoded = encodeCallback(d);
    expect(decodeCallback(encoded)).toEqual(d);
    expect(Buffer.byteLength(encoded)).toBeLessThanOrEqual(64);
  });

  it('is si:<action>:<id>:<version>[:<arg>]', () => {
    expect(encodeCallback({ action: 'm', id: ID, version: 4, arg: '2026-09' })).toBe(`si:m:${ID}:4:2026-09`);
    expect(encodeCallback({ action: 'a', id: ID, version: 4 })).toBe(`si:a:${ID}:4`);
  });

  it.each<[string | undefined, string]>([
    [`si:m:${ID}:1:2026-13`, 'a month that does not exist'],
    [`si:m:${ID}:1`, 'a month change with no month'],
    [`si:p:${ID}:1:9`, 'an index past the 8 candidates'],
    [`si:p:${ID}:1`, 'a pick with no index'],
    [`si:a:${ID}:1:extra`, 'an extra segment'],
    [`si:a:${ID}:1:2:3`, 'two extra segments'],
    [`si:z:${ID}:1`, 'an unknown action'],
    [`xx:a:${ID}:1`, 'a foreign prefix'],
    ['si:a:BAD:1', 'a bad id'],
    [`si:a:${ID}:-1`, 'a negative version'],
    [`si:a:${ID}:1234567`, 'a 7-digit version'],
    [`si:a:${ID}:01`, 'a version with a leading zero'],
    [`si:a:${ID}:`, 'an empty version'],
    ['', 'an empty string'],
    [undefined, 'no data'],
  ])('rejects %j (%s)', (data) => {
    expect(decodeCallback(data)).toBeNull();
  });
});

describe('month bounds', () => {
  it('runs from 24 months back to the current month', () => {
    expect(monthBounds('2026-10')).toEqual({ min: '2024-10', max: '2026-10' });
  });

  it.each([
    ['2026-11', false],
    ['2026-10', true],
    ['2024-10', true],
    ['2024-09', false],
    ['2026-1', false],
  ])('%s is allowed from 2026-10: %s', (month, allowed) => {
    expect(isAllowedMonth(month, '2026-10')).toBe(allowed);
  });
});

describe('monthLabel', () => {
  it('names the month and year', () => {
    expect(monthLabel('2026-10', 'en')).toBe('October 2026');
    expect(monthLabel('2026-09', 'en', 'short')).toBe('Sep 2026');
    expect(monthLabel('2026-10', 'he')).toBe('אוקטובר 2026');
  });
});

describe('renderCard buttons', () => {
  it('offers no later month on the current month, and no jump', () => {
    const msg = renderCard(card({ month: '2026-10' }));
    expect(monthTargets(msg)).toEqual(['2026-09']);
  });

  it('offers earlier, later and a jump to the current month from a month long ago', () => {
    const msg = renderCard(card({ month: '2025-06', depositDate: '2025-06-10' }));
    expect(monthTargets(msg).sort()).toEqual(['2025-05', '2025-07', '2026-10']);
    const jump = buttons(msg).find((b) => decodeCallback(b.callback_data)?.arg === '2026-10');
    expect(decodeCallback(jump!.callback_data)).toEqual({ action: 'm', id: ID, version: 3, arg: '2026-10' });
  });

  it('offers no jump one month back, where later already is the current month', () => {
    expect(monthTargets(renderCard(card({ month: '2026-09' }))).sort()).toEqual(['2026-08', '2026-10']);
  });

  it('offers no earlier month at the 24-month bound', () => {
    const msg = renderCard(card({ month: '2024-10', depositDate: '2024-10-01' }));
    expect(monthTargets(msg).sort()).toEqual(['2024-11', '2026-10']);
  });

  it('puts the later month first in Hebrew and last in English', () => {
    const he = monthRow(renderCard(card({ locale: 'he', month: '2025-06' })))!;
    expect(he.map((b) => b.text)).toEqual([
      `${monthLabel('2025-07', 'he', 'short')} ◀`,
      `▶ ${monthLabel('2025-05', 'he', 'short')}`,
    ]);
    expect(he.map((b) => decodeCallback(b.callback_data)!.arg)).toEqual(['2025-07', '2025-05']);

    const en = monthRow(renderCard(card({ locale: 'en', month: '2025-06' })))!;
    expect(en.map((b) => b.text)).toEqual([
      `◀ ${monthLabel('2025-05', 'en', 'short')}`,
      `${monthLabel('2025-07', 'en', 'short')} ▶`,
    ]);
  });

  it('approves with a, or with A ("Add anyway") once a duplicate is shown', () => {
    const plain = renderCard(card());
    expect(taps(plain)[0]).toEqual({ action: 'a', id: ID, version: 3 });
    expect(buttons(plain)[0].text).toBe('✅ Add');

    const dup = renderCard(card({ duplicate: { name: 'Dana', month: '2026-10', amount: 1234500 } }));
    expect(taps(dup)[0]).toEqual({ action: 'A', id: ID, version: 3 });
    expect(buttons(dup)[0].text).toBe('✅ Add anyway');
  });

  it('offers the way back to the list only when there was one, and always ends with cancel', () => {
    const actions = (v: CardView) => taps(renderCard(v)).map((d) => d!.action);
    expect(actions(card())).not.toContain('l');
    expect(actions(card({ hasOtherCandidates: true }))).toContain('l');
    expect(actions(card()).at(-1)).toBe('c');
  });

  it('binds every button to the card\'s row and version', () => {
    for (const d of taps(renderCard(card({ month: '2025-06', hasOtherCandidates: true })))) {
      expect(d).toMatchObject({ id: ID, version: 3 });
    }
  });
});

describe('renderCard text', () => {
  const lines = (v: CardView) => renderCard(v).text.split('\n');

  it('shows the amount, the deposit date, the month and the maaser it will record', () => {
    const text = renderCard(card({ amount: 1234567, percentage: 12 })).text;
    expect(text).toContain(formatCurrency(1234567, 'en'));
    expect(text).toContain('08.10.2026');
    expect(text).toContain('October 2026');
    expect(text).toContain('12%');
    expect(text).toContain(formatCurrency(maaserFor(1234567, 12), 'en'));
  });

  const warnings: [string, Partial<CardView>, string][] = [
    ['duplicate (you)', { duplicate: { name: null, month: '2026-10', amount: 1234500 } }, 'You already added'],
    ['duplicate (partner)', { duplicate: { name: 'Dana', month: '2026-11', amount: 1234500 } }, `Dana${PDI} already added`],
    ['another open card', { otherOpenSameAmount: true }, 'another open card'],
    ['month already paid', { monthPaid: true }, 'already has a payment'],
    ['old date', { depositDate: '2026-08-29' }, 'check the date'],
    ['unknown direction', { directionUnknown: true }, 'incoming'],
    ['no date', { dateFromImage: false }, 'used the day you sent it'],
    ['save failed', { saveFailed: true }, 'tap ✅ again'],
  ];

  it.each(warnings)('shows the %s line only when it applies', (_name, patch, fragment) => {
    expect(renderCard(card(patch)).text).toContain(fragment);
    expect(renderCard(card()).text).not.toContain(fragment);
  });

  it('names the partner, the amount and the month of a duplicate', () => {
    const text = renderCard(card({ duplicate: { name: 'Dana', month: '2026-11', amount: 1234500 } })).text;
    expect(text).toContain(`${FSI}Dana${PDI} already added ${formatCurrency(1234500, 'en')} in November 2026`);
  });

  it('warns about a date more than 40 days back, not at 40', () => {
    expect(renderCard(card({ depositDate: '2026-08-29', today: '2026-10-09' })).text).toContain('check the date');
    expect(renderCard(card({ depositDate: '2026-08-30', today: '2026-10-09' })).text).not.toContain('check the date');
  });

  it('orders the lines: title, amount, month, warnings, info, save failure, hint', () => {
    const all = lines(card({
      duplicate: { name: null, month: '2026-10', amount: 1 },
      otherOpenSameAmount: true,
      monthPaid: true,
      depositDate: '2026-08-01',
      directionUnknown: true,
      dateFromImage: false,
      saveFailed: true,
    }));
    const at = (fragment: string) => all.findIndex((l) => l.includes(fragment));
    const order = [
      'Salary deposit', 'deposited', 'maaser 10%', 'You already added', 'another open card',
      'already has a payment', 'check the date', 'incoming', 'used the day you sent it',
      'tap ✅ again', 'Reply with a number',
    ].map(at);
    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(all).toHaveLength(order.length);
  });

  it('starts every Hebrew line with RLM and isolates the description', () => {
    const he = lines(card({
      locale: 'he', description: 'משכורת ACME', duplicate: { name: 'Dana', month: '2026-10', amount: 1 },
      otherOpenSameAmount: true, monthPaid: true, directionUnknown: true, dateFromImage: false, saveFailed: true,
    }));
    for (const line of he) expect(line.startsWith(RLM)).toBe(true);
    expect(he.join('\n')).toContain(`${FSI}משכורת ACME${PDI}`);
    for (const line of lines(card())) expect(line.startsWith(RLM)).toBe(false);
  });

  it('truncates a long description before isolating it', () => {
    const long = 'x'.repeat(60);
    const text = renderCard(card({ description: long })).text;
    expect(text).toContain(`${FSI}${'x'.repeat(40)}…${PDI}`);
    expect(text).not.toContain('x'.repeat(41));
  });

  it('keeps a description from closing the isolate early', () => {
    const text = renderCard(card({ description: `evil${PDI}\u202e tail` })).text;
    expect(text).toContain(`${FSI}evil tail${PDI}`);
  });
});

describe('renderPicker', () => {
  const view = (patch: Partial<PickerView> = {}): PickerView => ({
    locale: 'en',
    id: ID,
    version: 1,
    truncated: false,
    candidates: [
      { amount: 1234567, date: '2026-10-10', month: '2026-10', dateFromImage: true, description: 'ACME', directionUnknown: false },
      { amount: 50000, date: '2026-10-08', month: '2026-10', dateFromImage: true, description: '', directionUnknown: true },
    ],
    ...patch,
  });

  it('lists every candidate, numbered, with a pick button each and then cancel', () => {
    const msg = renderPicker(view());
    const text = msg.text.split('\n');
    expect(text[1]).toBe(`1. ${formatCurrency(1234567, 'en')} · 10.10 · ${FSI}ACME${PDI}`);
    expect(text[2]).toBe(`2. ${formatCurrency(50000, 'en')} · 08.10 · ${FSI}Salary${PDI} ⚠`);
    expect(taps(msg)).toEqual([
      { action: 'p', id: ID, version: 1, arg: '0' },
      { action: 'p', id: ID, version: 1, arg: '1' },
      { action: 'c', id: ID, version: 1 },
    ]);
    expect(buttons(msg)[0].text).toBe(`1 · ${formatCurrency(1234567, 'en')} · 10.10`);
  });

  it('falls back to the default description in each locale', () => {
    expect(renderPicker(view({ locale: 'he' })).text).toContain(`${FSI}משכורת${PDI}`);
    expect(renderPicker(view({ locale: 'en' })).text).toContain(`${FSI}Salary${PDI}`);
  });

  it('says so when some candidates were left out', () => {
    const lines = (v: PickerView) => renderPicker(v).text.split('\n').length;
    expect(lines(view({ truncated: true }))).toBe(lines(view()) + 1);
    expect(renderPicker(view({ truncated: true })).text.split('\n').at(-1)).toContain('8');
  });

  it('starts every Hebrew line with RLM', () => {
    for (const line of renderPicker(view({ locale: 'he', truncated: true })).text.split('\n')) {
      expect(line.startsWith(RLM)).toBe(true);
    }
  });
});

describe('final states', () => {
  it('Added keeps the facts and opens the month in the app', () => {
    const appUrl = 'https://maaserot.vercel.app/en/income?month=2026-10';
    const msg = renderAdded({
      locale: 'en', amount: 1234567, description: 'ACME', month: '2026-10', percentage: 10, leftToPay: 50000, appUrl,
    });
    expect(msg.text).toContain(formatCurrency(1234567, 'en'));
    expect(msg.text).toContain(`${FSI}ACME${PDI}`);
    expect(msg.text).toContain('October 2026');
    expect(msg.text).toContain('10%');
    expect(msg.text).toContain(formatCurrency(123457, 'en'));
    expect(msg.text).toContain(formatCurrency(50000, 'en'));
    expect(buttons(msg)).toEqual([{ text: expect.any(String), web_app: { url: appUrl } }]);
  });

  it('Added in Hebrew starts every line with RLM', () => {
    const msg = renderAdded({
      locale: 'he', amount: 1234567, description: 'משכורת', month: '2026-10', percentage: 10, leftToPay: 0, appUrl: 'u',
    });
    for (const line of msg.text.split('\n')) expect(line.startsWith(RLM)).toBe(true);
  });

  it('Cancelled keeps the amount where there is one, and has no buttons', () => {
    const msg = renderCancelled({ locale: 'en', amount: 1234567 });
    expect(msg.text).toContain(formatCurrency(1234567, 'en'));
    expect(msg.replyMarkup).toBeUndefined();
    expect(renderCancelled({ locale: 'en', amount: null }).text).toBe('✖ Cancelled');
  });

  it('Expired, the pointer and the reading placeholder have no buttons', () => {
    for (const msg of [renderExpired('en'), renderUpdatedPointer('en'), renderReading('en')]) {
      expect(msg.text).not.toBe('');
      expect(msg.replyMarkup).toBeUndefined();
    }
  });
});

describe('notices and toasts', () => {
  it('fills values and carries an app button with the chosen label', () => {
    const msg = renderNotice('en', 'alreadyAddedReply', { month: 'October 2026' }, {
      kind: 'app', url: 'https://x/en/income?month=2026-10',
    });
    expect(msg.text).toContain('October 2026');
    expect(buttons(msg)).toEqual([{ text: expect.any(String), web_app: { url: 'https://x/en/income?month=2026-10' } }]);

    const tg = renderNotice('en', 'unknownSender', {}, { kind: 'app', url: 'https://x/tg', label: 'openAppTg' });
    expect(buttons(tg)[0].web_app!.url).toBe('https://x/tg');
    expect(buttons(tg)[0].text).not.toBe(buttons(msg)[0].text);
  });

  it('starts every Hebrew notice line with RLM', () => {
    for (const line of renderNotice('he', 'unknownSender').text.split('\n')) {
      expect(line.startsWith(RLM)).toBe(true);
    }
  });

  it('has no buttons without one', () => {
    expect(renderNotice('en', 'hint').replyMarkup).toBeUndefined();
  });

  it('gives toasts as plain text, short enough for Telegram', () => {
    for (const key of ['invalid', 'notYours', 'alreadyAdded', 'cancelled', 'stillReading', 'expired', 'changed'] as const) {
      for (const locale of ['he', 'en'] as const) {
        const text = toastText(locale, key);
        expect(text.length).toBeGreaterThan(1);
        expect(text.length).toBeLessThanOrEqual(200);
      }
    }
    expect(toastText('en', 'notYours')).toBe('Not yours');
  });
});

describe('locale', () => {
  it('uses the account locale, else Telegram\'s language, else Hebrew', () => {
    expect(localeFor({ locale: 'en' }, 'he')).toBe('en');
    expect(localeFor({ locale: 'he' }, 'en')).toBe('he');
    expect(localeFor(null, 'en')).toBe('en');
    expect(localeFor(null, 'en-GB')).toBe('en');
    expect(localeFor(null, 'ru')).toBe('he');
    expect(localeFor(null)).toBe('he');
    expect(localeFor({ locale: null }, 'en')).toBe('en');
  });

  it('defaults the description per locale', () => {
    expect(defaultDescription('he')).toBe('משכורת');
    expect(defaultDescription('en')).toBe('Salary');
  });
});
