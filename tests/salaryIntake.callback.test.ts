import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import he from '../messages/he.json';
import type { Candidate } from '@/lib/depositParsing';
import {
  decodeCallback,
  encodeCallback,
  renderAdded,
  renderCancelled,
  renderCard,
  renderExpired,
  renderNotice,
  renderPicker,
  renderUpdatedPointer,
  toastText,
  type BotToastKey,
  type CallbackAction,
  type CardView,
} from '@/lib/salaryCard';
import type { OutgoingMessage } from '@/lib/telegramBot';
import type { FakeDb, FakeIncome, FakePendingIncome } from './fakePrisma';
import { fixClock, pendingRow, setup, tapUpdate, u1, u2 } from './salaryIntakeHarness';

/**
 * Taps on a card's buttons and the ✅ (spec §4). Every tap is answered
 * exactly once, so each test also counts the answers. Claude, Telegram and
 * the database are all fakes; see ./salaryIntakeHarness.
 */

const HOUR = 3600_000;

/** The line image.ts selects for a lone deposit with no description. */
const salary: Candidate = {
  amount: 1234567, date: '2026-10-10', month: '2026-10', dateFromImage: true, description: '', directionUnknown: false,
};
const bonus: Candidate = {
  amount: 300000, date: '2026-10-11', month: '2026-10', dateFromImage: true, description: 'Bonus', directionUnknown: true,
};

/** A card as image.ts leaves it: one deposit, selected, shown on message 500. */
const cardRow = (patch: Partial<FakePendingIncome> = {}) =>
  pendingRow({
    status: 'OPEN', version: 1, cardMessageId: 500, candidates: [salary],
    amount: salary.amount, month: salary.month, depositDate: salary.date, dateFromImage: true,
    description: 'משכורת', percentage: 10,
    ...patch,
  });

/** A picker: several deposits, none chosen yet. */
const pickerRow = (candidates: Candidate[]) =>
  pendingRow({ status: 'OPEN', version: 1, cardMessageId: 500, candidates });

const tap = (
  row: { id: string },
  action: CallbackAction,
  version: number,
  o: { arg?: string; messageId?: number; fromId?: number; chatId?: number } = {}
) =>
  tapUpdate({
    data: encodeCallback({ action, id: row.id, version, ...(o.arg !== undefined && { arg: o.arg }) }),
    messageId: o.messageId ?? 500,
    fromId: o.fromId,
    chatId: o.chatId,
  });

type Tg = Awaited<ReturnType<typeof setup>>['tg'];

/** What message `id` shows now. */
const screen = (tg: Tg, id = 500): OutgoingMessage => tg.edited.filter((e) => e.messageId === id).at(-1)!.msg;
const taps = (msg: OutgoingMessage) =>
  (msg.replyMarkup?.inline_keyboard.flat() ?? []).map((b) => decodeCallback(b.callback_data));
const rowOf = (db: FakeDb, id: string) => db.pendingIncomes.find((r) => r.id === id)!;
const toast = (key: BotToastKey) => toastText('he', key);

/** The card rowMessage renders for `row` today (12 Oct 2026), with nothing to warn of unless patched in. */
const cardView = (row: FakePendingIncome, patch: Partial<CardView> = {}): CardView => ({
  locale: 'he', id: row.id, version: row.version,
  amount: row.amount!, month: row.month!, depositDate: row.depositDate!, dateFromImage: row.dateFromImage,
  description: row.description!, percentage: row.percentage!, directionUnknown: false,
  today: '2026-10-12', currentMonth: '2026-10', hasOtherCandidates: false,
  duplicate: null, otherOpenSameAmount: false, monthPaid: false,
  ...patch,
});

/** The Added text; `leftToPay` is what the harness's calculateGroupMonthState returns. */
const added = (amount: number, month: string) =>
  renderAdded({ locale: 'he', amount, description: 'משכורת', month, percentage: 10, leftToPay: 50_000, appUrl: 'x' }).text;

const income = (patch: Partial<FakeIncome>): FakeIncome => ({
  id: 'inc-seed', userId: 'u2', month: '2026-10', amount: 1234500, percentage: 10, maaser: 123450,
  description: null, isFrozen: false, ...patch,
});

const silenceErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

/** The longest stretch of a message that no placeholder fills in. */
const fixedPart = (template: string) => template.split(/\{[^}]*\}/).sort((a, b) => b.length - a.length)[0];

beforeEach(() => {
  fixClock();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('✅ Add', () => {
  it('records one Income at the card\'s month and percentage, closes the row and shows Added', async () => {
    const row = cardRow();
    const { db, tg, notify, handleUpdate } = await setup({ pendingIncomes: [row] });
    const update = tap(row, 'a', 1);

    await handleUpdate(update);

    expect(db.incomes).toHaveLength(1);
    expect(db.incomes[0]).toMatchObject({
      userId: 'u1', amount: 1234567, month: '2026-10', percentage: 10, maaser: 123457, description: 'משכורת',
    });
    expect(rowOf(db, row.id)).toMatchObject({ status: 'APPROVED', version: 2, incomeId: db.incomes[0].id, candidates: [] });

    expect(tg.answered).toEqual([{ id: update.callback_query!.id, text: undefined }]);
    const shown = screen(tg);
    expect(shown.text).toBe(added(1234567, '2026-10'));
    const [button] = shown.replyMarkup!.inline_keyboard.flat();
    expect(button.web_app!.url).toMatch(/\/he\/income\?month=2026-10$/);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('u1', '2026-10', 1234567);
    // The user sees Added first; the partner's message follows.
    expect(tg.editMessageText.mock.invocationCallOrder.at(-1)!).toBeLessThan(notify.mock.invocationCallOrder[0]);
  });

  it('tapped twice records one Income; the second tap hears "Already added" and sees Added again', async () => {
    const row = cardRow();
    const { db, tg, notify, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'a', 1));
    const edits = tg.edited.length;
    await handleUpdate(tap(row, 'a', 1));

    expect(db.incomes).toHaveLength(1);
    expect(tg.answered.map((a) => a.text)).toEqual([undefined, toast('alreadyAdded')]);
    expect(tg.edited.length).toBeGreaterThan(edits);
    expect(tg.edited.at(-1)!.messageId).toBe(500);
    expect(screen(tg).text).toBe(added(1234567, '2026-10'));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('with an old version records nothing, says "The card changed" and shows the card as it is', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'a', 0));

    expect(db.incomes).toHaveLength(0);
    expect(tg.answered.map((a) => a.text)).toEqual([toast('changed')]);
    expect(rowOf(db, row.id)).toMatchObject({ status: 'OPEN', version: 1 });
    expect(screen(tg)).toEqual(renderCard(cardView(row)));
  });

  it('still commits when answering the tap fails, and logs only the failure\'s name', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    tg.rejectAnswers = true;
    const errors = silenceErrors();
    const update = tap(row, 'a', 1);

    await handleUpdate(update);

    expect(tg.answered).toHaveLength(1);
    expect(db.incomes).toHaveLength(1);
    expect(rowOf(db, row.id).status).toBe('APPROVED');
    expect(screen(tg).text).toBe(added(1234567, '2026-10'));
    expect(errors.mock.calls).toEqual([['[salaryIntake:callback]', 'Error', undefined, update.update_id, row.id]]);
  });

  it('a partner notification that fails is logged, and the income stays', async () => {
    const row = cardRow();
    const { db, tg, notify, handleUpdate } = await setup({ pendingIncomes: [row] });
    notify.mockRejectedValueOnce(Object.assign(new Error('db down'), { code: 'P1001' }));
    const errors = silenceErrors();
    const update = tap(row, 'a', 1);

    await handleUpdate(update);

    expect(db.incomes).toHaveLength(1);
    expect(screen(tg).text).toBe(added(1234567, '2026-10'));
    expect(errors.mock.calls).toEqual([['[salaryIntake:notify]', 'Error', 'P1001', update.update_id, row.id]]);
  });

  // Success criterion 3: the Income is in, so the partner hears of it even
  // when the user's own screen could not be updated.
  it('an Added edit that fails still notifies the partner, after it, and the failure is logged', async () => {
    const row = cardRow();
    const { db, tg, notify, handleUpdate } = await setup({ pendingIncomes: [row] });
    const { TelegramError } = await import('@/lib/telegramBot');
    tg.editMessageText.mockRejectedValueOnce(new TelegramError('editMessageText', 'Bad Gateway', 502));
    const errors = silenceErrors();
    const update = tap(row, 'a', 1);

    await handleUpdate(update);

    expect(db.incomes).toHaveLength(1);
    expect(rowOf(db, row.id).status).toBe('APPROVED');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('u1', '2026-10', 1234567);
    // The render is still tried first.
    expect(tg.editMessageText.mock.invocationCallOrder[0]).toBeLessThan(notify.mock.invocationCallOrder[0]);
    expect(errors.mock.calls).toEqual([['[salaryIntake:update]', 'TelegramError', 502, update.update_id, undefined]]);
  });

  it('on a message that is not the row\'s card: Added goes on the card, and the tapped message points to it', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'a', 1, { messageId: 400 }));

    expect(db.incomes).toHaveLength(1);
    expect(screen(tg, 500).text).toBe(added(1234567, '2026-10'));
    expect(screen(tg, 400)).toEqual(renderUpdatedPointer('he'));
  });
});

describe('✅ when it cannot add', () => {
  it("a partner's Income within ₪1 this month blocks ✅ until \"Add anyway\"", async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row], incomes: [income({})] });

    await handleUpdate(tap(row, 'a', 1));

    expect(db.incomes).toHaveLength(1);
    // Bumped, so the ✅ just tapped cannot be replayed past the warning.
    expect(rowOf(db, row.id)).toMatchObject({ status: 'OPEN', version: 2 });
    const card = screen(tg);
    expect(card).toEqual(
      renderCard(cardView(rowOf(db, row.id), { duplicate: { name: 'Dana', month: '2026-10', amount: 1234500 } }))
    );
    expect(card.text).toContain('⁨Dana⁩');
    expect(taps(card)[0]).toMatchObject({ action: 'A', version: 2 });

    await handleUpdate(tap(row, 'A', 2));

    expect(db.incomes.filter((i) => i.userId === 'u1')).toHaveLength(1);
    expect(rowOf(db, row.id).status).toBe('APPROVED');
    expect(tg.answered.map((a) => a.text)).toEqual([undefined, undefined]);
  });

  it('an Income filed under the next month counts too; one ₪1 off or two months away does not', async () => {
    for (const [seeded, blocked] of [
      [income({ month: '2026-11' }), true],
      [income({ amount: 1234567 - 101 }), false],
      [income({ month: '2026-12' }), false],
      [income({ userId: 'u9' }), false],
    ] as const) {
      const row = cardRow();
      const { db, handleUpdate } = await setup({ pendingIncomes: [row], incomes: [seeded] });

      await handleUpdate(tap(row, 'a', 1));

      expect(db.incomes.filter((i) => i.userId === 'u1')).toHaveLength(blocked ? 0 : 1);
    }
  });

  it("names the sender's own match over a newer one of the partner's, whatever order they come in", async () => {
    const row = cardRow();
    const { tg, handleUpdate } = await setup({
      pendingIncomes: [row],
      incomes: [
        income({ id: 'theirs', createdAt: new Date(Date.now() - HOUR) }),
        income({ id: 'mine', userId: 'u1', amount: 1234567, createdAt: new Date(Date.now() - 2 * HOUR) }),
      ],
    });

    await handleUpdate(tap(row, 'a', 1));

    expect(screen(tg).text).toContain(fixedPart(he.bot.card.warnDuplicateSelf));
    expect(screen(tg).text).not.toContain('Dana');
  });

  it('a match of a partner with no name is "your partner", not an empty name', async () => {
    const row = cardRow();
    const { tg, handleUpdate } = await setup({
      pendingIncomes: [row],
      incomes: [income({})],
      users: [{ ...u1 }, { ...u2, name: null }],
    });

    await handleUpdate(tap(row, 'a', 1));

    const text = screen(tg).text;
    expect(text).toContain(`${he.bot.card.partnerFallback} כבר הוסיף/ה`);
    expect(text).not.toContain('\u2068\u2069');
  });

  it('two open cards for the same deposit: the second asks "Add anyway", and A adds it', async () => {
    const first = cardRow();
    const second = cardRow({ cardMessageId: 501 });
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [first, second] });

    await handleUpdate(tap(first, 'a', 1));
    await handleUpdate(tap(second, 'a', 1, { messageId: 501 }));

    expect(db.incomes).toHaveLength(1);
    expect(screen(tg, 501)).toEqual(
      renderCard(cardView(rowOf(db, second.id), { duplicate: { name: null, month: '2026-10', amount: 1234567 } }))
    );
    expect(taps(screen(tg, 501))[0]).toMatchObject({ action: 'A', version: 2 });

    await handleUpdate(tap(second, 'A', 2, { messageId: 501 }));

    expect(db.incomes).toHaveLength(2);
    expect(rowOf(db, second.id).status).toBe('APPROVED');
  });

  it('a save that fails rolls back: the row stays OPEN, the card asks for ✅ again, and the next ✅ adds', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    const incomes = await import('@/lib/incomes');
    vi.spyOn(incomes, 'addIncome').mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: 'P1001' }));
    const errors = silenceErrors();
    const update = tap(row, 'a', 1);

    await handleUpdate(update);

    expect(db.incomes).toHaveLength(0);
    expect(rowOf(db, row.id)).toMatchObject({ status: 'OPEN', version: 1, incomeId: null });
    expect(rowOf(db, row.id).candidates).toHaveLength(1);
    // The rollback restores clones, so the seeded object is not the row any more.
    expect(screen(tg)).toEqual(renderCard(cardView(rowOf(db, row.id), { saveFailed: true })));
    expect(screen(tg).text).toContain(he.bot.card.saveFailed);
    expect(errors.mock.calls).toEqual([['[salaryIntake:approve]', 'Error', 'P1001', update.update_id, row.id]]);

    await handleUpdate(tap(row, 'a', 1));

    expect(db.incomes).toHaveLength(1);
    expect(rowOf(db, row.id).status).toBe('APPROVED');
  });

  // The row keeps the percentage it was picked at, so a ✅ after Settings is
  // fixed would fail the same way: the card is closed instead (spec §4).
  it('a card picked at a default percentage of 0 is closed, with "check your percentage", not "tap again"', async () => {
    const row = cardRow({ percentage: 0 });
    const { db, tg, handleUpdate } = await setup({
      pendingIncomes: [row],
      users: [{ ...u1, defaultPercent: 0 }, { ...u2 }],
    });
    const errors = silenceErrors();

    await handleUpdate(tap(row, 'a', 1));

    expect(db.incomes).toHaveLength(0);
    expect(rowOf(db, row.id)).toMatchObject({ status: 'CANCELLED', version: 2, candidates: [] });
    expect(screen(tg)).toEqual(renderCancelled({ locale: 'he', amount: 1234567 }));
    expect(taps(screen(tg))).toEqual([]);
    expect(tg.sent.map((s) => s.msg)).toEqual([renderNotice('he', 'checkPercent')]);
    expect(renderNotice('en', 'checkPercent').text).toMatch(/send the screenshot or the amount again/);
    expect(tg.edited.map((e) => e.msg.text).join('\n')).not.toContain(he.bot.card.saveFailed);
    // Expected, not a fault: nothing is logged.
    expect(errors).not.toHaveBeenCalled();

    // Settings fixed, the old card cannot be used again: it says it was cancelled.
    db.users.find((u) => u.id === 'u1')!.defaultPercent = 10;
    await handleUpdate(tap(row, 'a', 1));

    expect(db.incomes).toHaveLength(0);
    expect(tg.answered.map((a) => a.text)).toEqual([undefined, toast('cancelled')]);
  });

  it('a card at a percentage of 0 that cannot be edited still gets "check your percentage"', async () => {
    const row = cardRow({ percentage: 0 });
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    const { TelegramError } = await import('@/lib/telegramBot');
    tg.editMessageText.mockRejectedValueOnce(new TelegramError('editMessageText', 'Bad Gateway', 502));
    const errors = silenceErrors();
    const update = tap(row, 'a', 1);

    await handleUpdate(update);

    expect(rowOf(db, row.id).status).toBe('CANCELLED');
    expect(tg.sent.map((s) => s.msg)).toEqual([renderNotice('he', 'checkPercent')]);
    expect(errors.mock.calls).toEqual([['[salaryIntake:update]', 'TelegramError', 502, update.update_id, undefined]]);
  });
});

describe('the month buttons', () => {
  it('▶ September files the card there; the old ✅ is then refused and the new one adds to September', async () => {
    const row = cardRow();
    const { db, tg, notify, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'm', 1, { arg: '2026-09' }));

    expect(rowOf(db, row.id)).toMatchObject({ month: '2026-09', version: 2 });
    expect(screen(tg)).toEqual(renderCard(cardView(rowOf(db, row.id))));

    await handleUpdate(tap(row, 'a', 1));

    expect(db.incomes).toHaveLength(0);
    expect(tg.answered.at(-1)!.text).toBe(toast('changed'));

    await handleUpdate(tap(row, 'a', 2));

    expect(db.incomes).toHaveLength(1);
    expect(db.incomes[0].month).toBe('2026-09');
    expect(notify).toHaveBeenCalledWith('u1', '2026-09', 1234567);
    expect(tg.answered).toHaveLength(3);
  });

  it("accepts the Israeli current month while UTC is still in the last one", async () => {
    fixClock('2026-09-30T22:30:00Z'); // 01:30 on 1 October in Israel
    const row = cardRow({ month: '2026-09', depositDate: '2026-09-30' });
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'm', 1, { arg: '2026-10' }));

    expect(tg.answered.map((a) => a.text)).toEqual([undefined]);
    expect(rowOf(db, row.id)).toMatchObject({ month: '2026-10', version: 2 });
  });

  it('a hand-crafted future month is "no longer valid" and changes nothing', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    const before = { ...row };

    await handleUpdate(tap(row, 'm', 1, { arg: '2026-11' }));

    expect(tg.answered.map((a) => a.text)).toEqual([toast('invalid')]);
    expect(rowOf(db, row.id)).toEqual(before);
    expect(tg.edited).toHaveLength(0);
  });
});

describe('the picker', () => {
  it('a pick shows that deposit\'s card, ↩ goes back to the list, and another pick shows the other', async () => {
    const row = pickerRow([{ ...salary, description: 'ACME Ltd' }, bonus]);
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'p', 1, { arg: '1' }));

    expect(rowOf(db, row.id)).toMatchObject({
      version: 2, amount: 300000, month: '2026-10', depositDate: '2026-10-11', dateFromImage: true,
      description: 'Bonus', percentage: 10,
    });
    let card = screen(tg);
    expect(card).toEqual(renderCard(cardView(rowOf(db, row.id), { directionUnknown: true, hasOtherCandidates: true })));
    expect(card.text).toContain(he.bot.card.warnDirection);
    expect(taps(card).map((d) => d!.action)).toContain('l');

    await handleUpdate(tap(row, 'l', 2));

    expect(rowOf(db, row.id)).toMatchObject({
      version: 3, amount: null, month: null, depositDate: null, description: null, percentage: null,
    });
    expect(screen(tg)).toEqual(
      renderPicker({ locale: 'he', id: row.id, version: 3, candidates: [{ ...salary, description: 'ACME Ltd' }, bonus], truncated: false })
    );

    await handleUpdate(tap(row, 'p', 3, { arg: '0' }));

    expect(rowOf(db, row.id)).toMatchObject({ version: 4, amount: 1234567, description: 'ACME Ltd' });
    card = screen(tg);
    expect(card).toEqual(renderCard(cardView(rowOf(db, row.id), { hasOtherCandidates: true })));
    expect(card.text).not.toContain(he.bot.card.warnDirection);
    expect(tg.answered.map((a) => a.text)).toEqual([undefined, undefined, undefined]);
  });

  it('a deposit with no description is stored and shown as the default one', async () => {
    const row = pickerRow([salary, { ...bonus, description: '', directionUnknown: false }]);
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'p', 1, { arg: '1' }));

    expect(rowOf(db, row.id).description).toBe('משכורת');
    expect(screen(tg).text).toContain('⁨משכורת⁩');
  });

  it('takes the percentage from the sender at the moment of the pick', async () => {
    const row = pickerRow([salary, bonus]);
    const { db, handleUpdate } = await setup({
      pendingIncomes: [row],
      users: [{ ...u1, defaultPercent: 20 }, { ...u2 }],
    });

    await handleUpdate(tap(row, 'p', 1, { arg: '0' }));

    expect(rowOf(db, row.id).percentage).toBe(20);
  });
});

describe('✖ Cancel', () => {
  it('closes the card; a ✅ after it hears "Cancelled", never "send again", and adds nothing', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'c', 1));

    expect(rowOf(db, row.id)).toMatchObject({ status: 'CANCELLED', version: 2, candidates: [] });
    expect(screen(tg)).toEqual(renderCancelled({ locale: 'he', amount: 1234567 }));

    await handleUpdate(tap(row, 'a', 1));

    expect(db.incomes).toHaveLength(0);
    expect(tg.answered.map((a) => a.text)).toEqual([undefined, toast('cancelled')]);
    expect(screen(tg)).toEqual(renderCancelled({ locale: 'he', amount: 1234567 }));
    const everything = [...tg.answered.map((a) => a.text ?? ''), ...tg.edited.map((e) => e.msg.text)].join('\n');
    expect(everything).not.toContain(he.bot.toast.expired);
    expect(everything).not.toContain(he.bot.final.expired);
  });
});

describe('taps that are refused', () => {
  it('a tap by someone else is "Not yours" and changes nothing', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    const before = { ...row };

    await handleUpdate(tap(row, 'a', 1, { fromId: 222 }));

    expect(tg.answered.map((a) => a.text)).toEqual([toast('notYours')]);
    expect(rowOf(db, row.id)).toEqual(before);
    expect(db.incomes).toHaveLength(0);
    expect(tg.edited).toHaveLength(0);
  });

  it("a tap from another chat is \"Not yours\", even from the row's own user", async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'a', 1, { chatId: 333 }));

    expect(tg.answered.map((a) => a.text)).toEqual([toast('notYours')]);
    expect(db.incomes).toHaveLength(0);
    expect(tg.edited).toHaveLength(0);
  });

  it('an expired card says "Expired", shows it, and adds nothing', async () => {
    const row = cardRow({ createdAt: new Date(Date.now() - 49 * HOUR) });
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'a', 1));

    expect(tg.answered.map((a) => a.text)).toEqual([toast('expired')]);
    expect(screen(tg)).toEqual(renderExpired('he'));
    expect(db.incomes).toHaveLength(0);
    expect(rowOf(db, row.id).status).toBe('OPEN');
  });

  it('data that does not decode, or names no row, is "no longer valid" and nothing else', async () => {
    const { tg, handleUpdate } = await setup({ pendingIncomes: [cardRow()] });

    await handleUpdate(tapUpdate({ data: 'si:a:not-an-id:1', messageId: 500 }));
    await handleUpdate(tap({ id: `c${'9'.repeat(24)}` }, 'a', 1));

    expect(tg.answered.map((a) => a.text)).toEqual([toast('invalid'), toast('invalid')]);
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent).toHaveLength(0);
  });

  it('a row still being read is "Still reading", and nothing is shown', async () => {
    const row = pendingRow({ status: 'READING', version: 0, cardMessageId: 500 });
    const { tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'c', 0));

    expect(tg.answered.map((a) => a.text)).toEqual([toast('stillReading')]);
    expect(tg.edited).toHaveLength(0);
  });

  it.each<[string, () => FakePendingIncome, CallbackAction, string | undefined]>([
    ['a pick past the last deposit', () => pickerRow([salary, bonus]), 'p', '2'],
    ['↩ on a card that had one deposit', () => cardRow(), 'l', undefined],
    ['a month on a picker, which has no month yet', () => pickerRow([salary, bonus]), 'm', '2026-09'],
  ])('%s is "no longer valid" and changes nothing', async (_, make, action, arg) => {
    const row = make();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    const before = { ...row };

    await handleUpdate(tap(row, action, 1, { arg }));

    expect(tg.answered.map((a) => a.text)).toEqual([toast('invalid')]);
    expect(rowOf(db, row.id)).toEqual(before);
    expect(tg.edited).toHaveLength(0);
  });

  it('an old version tapped on an older message points it down and leaves the current card alone', async () => {
    const row = cardRow({ version: 2, cardMessageId: 501 });
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(tap(row, 'a', 1, { messageId: 500 }));

    expect(tg.answered.map((a) => a.text)).toEqual([toast('changed')]);
    expect(db.incomes).toHaveLength(0);
    expect(tg.edited.map((e) => e.messageId)).toEqual([500]);
    expect(screen(tg, 500)).toEqual(renderUpdatedPointer('he'));
  });
});

describe('a database that fails before the tap is answered', () => {
  /** Shaped as Prisma's are. Its message names the server, so it must never reach a log. */
  const dbError = () =>
    Object.assign(new Error('Timed out fetching a new connection from the pool at db.internal:5432'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2024',
    });
  type Method = (...args: never[]) => Promise<unknown>;
  const fakeClient = async () =>
    ((await import('@/lib/prisma')) as unknown as {
      prisma: { pendingIncome: { findUnique: Method }; user: { findUnique: Method } };
    }).prisma;

  it('loading the row → the tap is still answered, once, with "couldn\'t check", and nothing changes', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    vi.spyOn((await fakeClient()).pendingIncome, 'findUnique').mockRejectedValueOnce(dbError());
    const errors = silenceErrors();
    const before = structuredClone(db.pendingIncomes);
    const update = tap(row, 'a', 1);

    await handleUpdate(update);

    expect(tg.answered).toEqual([{ id: update.callback_query!.id, text: toast('error') }]);
    expect(db.pendingIncomes).toEqual(before);
    expect(db.incomes).toHaveLength(0);
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent).toHaveLength(0);
    expect(errors.mock.calls).toEqual([
      ['[salaryIntake:callback]', 'PrismaClientKnownRequestError', 'P2024', update.update_id, row.id],
    ]);
  });

  it("loading the sender → the tap is still answered, once, in Telegram's language", async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    vi.spyOn((await fakeClient()).user, 'findUnique').mockRejectedValueOnce(dbError());
    const errors = silenceErrors();
    const update = tapUpdate({ data: encodeCallback({ action: 'a', id: row.id, version: 1 }), messageId: 500, languageCode: 'en' });

    await handleUpdate(update);

    expect(tg.answered).toEqual([{ id: update.callback_query!.id, text: toastText('en', 'error') }]);
    expect(db.incomes).toHaveLength(0);
    expect(tg.sent).toHaveLength(0);
    expect(errors.mock.calls).toEqual([
      ['[salaryIntake:update]', 'PrismaClientKnownRequestError', 'P2024', update.update_id, undefined],
    ]);
  });
});
