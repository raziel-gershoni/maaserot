import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate } from '@/lib/depositParsing';
import {
  decodeCallback,
  encodeCallback,
  monthLabel,
  renderAdded,
  renderCard,
  renderNotice,
  renderUpdatedPointer,
  toastText,
  type BotNoticeKey,
  type CallbackAction,
  type CardView,
  type Locale,
} from '@/lib/salaryCard';
import type { OutgoingMessage } from '@/lib/telegramBot';
import type { FakeDb, FakePendingIncome } from './fakePrisma';
import { FIRST_SENT_ID, fixClock, pendingRow, photoUpdate, setup, tapUpdate, textUpdate, u1, u2 } from './salaryIntakeHarness';

/**
 * Typed messages (spec §5) and /start (spec Flow 1): a number that fixes a
 * card's amount or starts a card, and everything else. Claude, Telegram and
 * the database are all fakes; see ./salaryIntakeHarness.
 */

const HOUR = 3600_000;
/** 12 Oct 2026, 11:00 in Israel: the harness's fixed clock. */
const TODAY = '2026-10-12';

const salary: Candidate = {
  amount: 1234567, date: '2026-10-10', month: '2026-10', dateFromImage: true, description: '', directionUnknown: false,
};
const bonus: Candidate = {
  amount: 300000, date: '2026-10-11', month: '2026-10', dateFromImage: true, description: 'Bonus', directionUnknown: false,
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
const pickerRow = (patch: Partial<FakePendingIncome> = {}) =>
  pendingRow({ status: 'OPEN', version: 1, cardMessageId: 500, candidates: [salary, bonus], ...patch });

const tap = (row: { id: string }, action: CallbackAction, version: number, messageId = 500) =>
  tapUpdate({ data: encodeCallback({ action, id: row.id, version }), messageId });

type Tg = Awaited<ReturnType<typeof setup>>['tg'];

const rowOf = (db: FakeDb, id: string) => db.pendingIncomes.find((r) => r.id === id)!;
/** What message `id` shows now. */
const screen = (tg: Tg, id: number): OutgoingMessage => tg.edited.filter((e) => e.messageId === id).at(-1)!.msg;
const notice = (key: BotNoticeKey, locale: Locale = 'he') => renderNotice(locale, key);
const webAppUrls = (msg: OutgoingMessage) =>
  (msg.replyMarkup?.inline_keyboard.flat() ?? []).flatMap((b) => (b.web_app ? [b.web_app.url] : []));
const tappedIds = (msg: OutgoingMessage) =>
  (msg.replyMarkup?.inline_keyboard.flat() ?? []).flatMap((b) => {
    const d = decodeCallback(b.callback_data);
    return d ? [d.id] : [];
  });

/** The card rowMessage renders for `row` today, with nothing to warn of unless patched in. */
const cardView = (row: FakePendingIncome, patch: Partial<CardView> = {}): CardView => ({
  locale: 'he', id: row.id, version: row.version,
  amount: row.amount!, month: row.month!, depositDate: row.depositDate!, dateFromImage: row.dateFromImage,
  description: row.description!, percentage: row.percentage!, directionUnknown: false,
  today: TODAY, currentMonth: '2026-10', hasOtherCandidates: false,
  duplicate: null, otherOpenSameAmount: false, monthPaid: false,
  ...patch,
});

/** Unix seconds, as Telegram dates a message. */
const sentAt = (iso: string) => Math.floor(Date.parse(iso) / 1000);

beforeEach(() => {
  fixClock();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('an amount sent as a reply to a card', () => {
  it('sets the amount, points the old card down, and sends a new card that ✅ adds', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(textUpdate({ text: ' 12,500 ', messageId: 600, replyTo: 500 }));

    expect(rowOf(db, row.id)).toMatchObject({
      status: 'OPEN', version: 2, amount: 1250000, cardMessageId: FIRST_SENT_ID,
      // Only the amount: the deposit's date, month and description stay.
      month: '2026-10', depositDate: '2026-10-10', dateFromImage: true, description: 'משכורת', percentage: 10,
    });
    expect(tg.edited).toEqual([{ chatId: BigInt(111), messageId: 500, msg: renderUpdatedPointer('he') }]);
    expect(tg.sent).toEqual([
      { chatId: BigInt(111), replyTo: 600, msg: renderCard(cardView(rowOf(db, row.id))) },
    ]);
    // The old card loses its buttons before the new one is out.
    expect(tg.editMessageText.mock.invocationCallOrder[0]).toBeLessThan(tg.sendMessage.mock.invocationCallOrder[0]);

    await handleUpdate(tap(row, 'a', 2, FIRST_SENT_ID));

    expect(db.incomes).toHaveLength(1);
    expect(db.incomes[0]).toMatchObject({ userId: 'u1', amount: 1250000, month: '2026-10', percentage: 10, maaser: 125000 });
  });

  it('then ✅ on the old card records nothing and says the card changed', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600, replyTo: 500 }));
    await handleUpdate(tap(row, 'a', 1, 500));

    expect(db.incomes).toHaveLength(0);
    expect(tg.answered.map((a) => a.text)).toEqual([toastText('he', 'changed')]);
    expect(rowOf(db, row.id)).toMatchObject({ status: 'OPEN', version: 2, amount: 1250000 });
    expect(screen(tg, 500)).toEqual(renderUpdatedPointer('he'));
  });

  it('still sends the new card when the old one cannot be edited, and logs only the failure\'s name and status', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    const { TelegramError } = await import('@/lib/telegramBot');
    tg.editMessageText.mockRejectedValueOnce(new TelegramError('editMessageText', 'message to edit not found', 400));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const update = textUpdate({ text: '12,500', messageId: 600, replyTo: 500 });

    await handleUpdate(update);

    expect(rowOf(db, row.id)).toMatchObject({ amount: 1250000, version: 2, cardMessageId: FIRST_SENT_ID });
    expect(tg.sent.map((s) => s.msg)).toEqual([renderCard(cardView(rowOf(db, row.id)))]);
    expect(errors.mock.calls).toEqual([['[salaryIntake:text]', 'TelegramError', 400, update.update_id, row.id]]);
  });

  it('to an added card: "already added to October", with the app open at that month, and nothing changes', async () => {
    const row = cardRow({ status: 'APPROVED', version: 2, candidates: [], incomeId: 'inc-1' });
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    const before = structuredClone(db.pendingIncomes);

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600, replyTo: 500 }));

    expect(db.pendingIncomes).toEqual(before);
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0]).toMatchObject({ replyTo: 600 });
    const msg = tg.sent[0].msg;
    expect(msg.text).toBe(renderNotice('he', 'alreadyAddedReply', { month: monthLabel('2026-10', 'he') }).text);
    expect(msg.text).toContain('אוקטובר 2026');
    expect(webAppUrls(msg)).toHaveLength(1);
    expect(webAppUrls(msg)[0]).toMatch(/\/he\/income\?month=2026-10$/);
  });

  it.each([
    ['a cancelled card', () => cardRow({ status: 'CANCELLED', version: 2, candidates: [] }), 'closedCard'],
    ['an expired card', () => cardRow({ createdAt: new Date(Date.now() - 49 * HOUR) }), 'closedCard'],
    ['a screenshot still being read', () => pendingRow({ status: 'READING', version: 0, cardMessageId: 500 }), 'stillReading'],
  ] as const)('to %s → its notice, and nothing changes', async (_, makeRow, key) => {
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [makeRow()] });
    const before = structuredClone(db.pendingIncomes);

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600, replyTo: 500 }));

    expect(db.pendingIncomes).toEqual(before);
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent.map((s) => s.msg)).toEqual([notice(key)]);
  });

  it('to a message that is no card → "reply to the newest card", and the open card is left alone', async () => {
    const open = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [open] });
    const before = structuredClone(db.pendingIncomes);

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600, replyTo: 499 }));

    expect(db.pendingIncomes).toEqual(before);
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent.map((s) => s.msg)).toEqual([notice('staleReply')]);
  });

  it('to a card a later reply replaced → "reply to the newest card", and the new card keeps its amount', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600, replyTo: 500 }));
    await handleUpdate(textUpdate({ text: '9,000', messageId: 601, replyTo: 500 }));

    expect(rowOf(db, row.id)).toMatchObject({ amount: 1250000, version: 2, cardMessageId: FIRST_SENT_ID });
    expect(tg.sent.at(-1)!.msg).toEqual(notice('staleReply'));
  });

  it("finds only the sender's own row, though another user's card has the same message id", async () => {
    const mine = cardRow({ createdAt: new Date(Date.now() - HOUR) });
    // Newer, so a lookup by message id alone would pick it.
    const theirs = cardRow({ userId: 'u2', chatId: BigInt(222), amount: 999900 });
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [mine, theirs] });
    const theirsBefore = structuredClone(theirs);

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600, replyTo: 500 }));

    expect(rowOf(db, mine.id)).toMatchObject({ amount: 1250000, version: 2 });
    expect(rowOf(db, theirs.id)).toEqual(theirsBefore);
    const shown = [...tg.sent, ...tg.edited];
    expect(shown.every((m) => m.chatId === BigInt(111))).toBe(true);
    const ids = shown.flatMap((m) => tappedIds(m.msg));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id === mine.id)).toBe(true);
    expect(shown.map((m) => m.msg.text).join('\n')).not.toContain('9,999');
  });
});

describe('an amount sent on its own', () => {
  it("goes to the newest open card: a picker becomes a card dated the Israeli day it was sent", async () => {
    const older = cardRow({ createdAt: new Date(Date.now() - HOUR), cardMessageId: 400 });
    const picker = pickerRow({ cardMessageId: 500 });
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [older, picker] });
    const olderBefore = structuredClone(older);

    // 1 Oct, 01:30 in Israel, though still 30 Sep in UTC; delivered on the 12th.
    await handleUpdate(textUpdate({ text: '₪12,500', messageId: 600, date: sentAt('2026-09-30T22:30:00Z') }));

    expect(rowOf(db, picker.id)).toMatchObject({
      status: 'OPEN', version: 2, amount: 1250000, month: '2026-10', depositDate: '2026-10-01',
      dateFromImage: false, description: 'משכורת', percentage: 10, cardMessageId: FIRST_SENT_ID,
      // Kept while the card is open, so ↩ can still go back to them.
      candidates: [salary, bonus],
    });
    expect(rowOf(db, older.id)).toEqual(olderBefore);
    expect(tg.edited.map((e) => e.messageId)).toEqual([500]);
    expect(screen(tg, 500)).toEqual(renderUpdatedPointer('he'));
    expect(tg.sent).toEqual([
      {
        chatId: BigInt(111), replyTo: 600,
        msg: renderCard(cardView(rowOf(db, picker.id), { hasOtherCandidates: true, otherOpenSameAmount: false })),
      },
    ]);
  });

  it('takes the percentage from the sender when the amount fills a picker', async () => {
    const picker = pickerRow();
    const { db, handleUpdate } = await setup({
      users: [{ ...u1, defaultPercent: 20, locale: 'en' }, { ...u2 }],
      pendingIncomes: [picker],
    });

    await handleUpdate(textUpdate({ text: '12500', messageId: 600 }));

    expect(rowOf(db, picker.id)).toMatchObject({ amount: 1250000, percentage: 20, description: 'Salary' });
  });

  it('with no open card starts a typed card, which ✅ adds to this month', async () => {
    const { db, tg, reader, handleUpdate } = await setup();

    await handleUpdate(textUpdate({ text: '12,500.50', messageId: 600 }));

    expect(reader).not.toHaveBeenCalled();
    expect(db.pendingIncomes).toHaveLength(1);
    const row = db.pendingIncomes[0];
    expect(row).toMatchObject({
      userId: 'u1', chatId: BigInt(111), sourceMessageId: 600, viaImage: false, status: 'OPEN', version: 1,
      candidates: [], amount: 1250050, month: '2026-10', depositDate: TODAY, dateFromImage: false,
      description: 'משכורת', percentage: 10, cardMessageId: FIRST_SENT_ID,
    });
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent).toEqual([{ chatId: BigInt(111), replyTo: 600, msg: renderCard(cardView(row)) }]);

    await handleUpdate(tap(row, 'a', 1, FIRST_SENT_ID));

    expect(db.incomes).toHaveLength(1);
    expect(db.incomes[0]).toMatchObject({ userId: 'u1', amount: 1250050, month: '2026-10', percentage: 10 });
  });

  it("files a typed card under the Israeli month, while UTC is still in the last one", async () => {
    fixClock('2026-09-30T21:30:00Z'); // 1 Oct, 00:30 in Israel
    const { db, tg, handleUpdate } = await setup();

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600 }));

    expect(db.pendingIncomes[0]).toMatchObject({ month: '2026-10', depositDate: '2026-10-01' });
    expect(tg.sent[0].msg).toEqual(
      renderCard(cardView(db.pendingIncomes[0], { today: '2026-10-01', currentMonth: '2026-10' }))
    );
  });

  it('typed cards do not count toward the reading quota', async () => {
    const { db, tg, reader, handleUpdate } = await setup();

    // Ten typed cards in a row, each closed so the next amount starts a new one.
    for (let i = 0; i < 10; i++) {
      await handleUpdate(textUpdate({ text: '12,500', messageId: 600 + i }));
      const row = db.pendingIncomes.find((r) => r.sourceMessageId === 600 + i)!;
      await handleUpdate(tap(row, 'c', 1, row.cardMessageId!));
    }
    expect(db.pendingIncomes.filter((r) => !r.viaImage && r.status === 'CANCELLED')).toHaveLength(10);

    await handleUpdate(photoUpdate({ messageId: 700 }));

    expect(reader).toHaveBeenCalledTimes(1);
    expect(db.pendingIncomes.find((r) => r.sourceMessageId === 700)!.status).toBe('OPEN');
    expect([...tg.sent, ...tg.edited].map((m) => m.msg.text)).not.toContain(notice('tooMany').text);
  });
});

describe('other text', () => {
  it.each(['hello', '-12,500', '12.345'])('%j → the hint, and no row', async (text) => {
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [cardRow()] });
    const before = structuredClone(db.pendingIncomes);

    await handleUpdate(textUpdate({ text, messageId: 600, replyTo: 500 }));

    expect(db.pendingIncomes).toEqual(before);
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent).toEqual([{ chatId: BigInt(111), replyTo: 600, msg: notice('hint') }]);
  });

  it('/start → the welcome, with a button that opens /tg', async () => {
    const { db, tg, handleUpdate } = await setup();

    await handleUpdate(textUpdate({ text: '/start', messageId: 600 }));

    expect(db.pendingIncomes).toHaveLength(0);
    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0].msg.text).toBe(notice('welcome').text);
    expect(webAppUrls(tg.sent[0].msg)).toHaveLength(1);
    expect(webAppUrls(tg.sent[0].msg)[0]).toMatch(/\/tg$/);
  });

  it("/start from an unknown sender → the welcome too, in Telegram's language", async () => {
    const { tg, handleUpdate } = await setup();

    await handleUpdate(textUpdate({ text: '/start', messageId: 600, fromId: 999, languageCode: 'en-GB' }));

    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0].msg.text).toBe(notice('welcome', 'en').text);
    expect(webAppUrls(tg.sent[0].msg)[0]).toMatch(/\/tg$/);
  });

  it('an amount from an unknown sender → the /tg message, and no row', async () => {
    const { db, tg, handleUpdate } = await setup();

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600, fromId: 999 }));

    expect(db.pendingIncomes).toHaveLength(0);
    expect(tg.sent.map((s) => s.msg.text)).toEqual([notice('unknownSender').text]);
    expect(webAppUrls(tg.sent[0].msg)[0]).toMatch(/\/tg$/);
  });
});

describe('an amount that loses a race', () => {
  /** Runs `between` after the reply's row is read and before the amount is written. */
  async function betweenReadAndWrite(between: () => Promise<void>) {
    const { prisma } = (await import('@/lib/prisma')) as unknown as {
      prisma: { pendingIncome: { findFirst: (args: unknown) => Promise<unknown> } };
    };
    const read = prisma.pendingIncome.findFirst;
    vi.spyOn(prisma.pendingIncome, 'findFirst').mockImplementationOnce(async (args) => {
      const found = await read(args);
      await between();
      return found;
    });
  }

  it('to a ✅ → no card sent or edited, only "already added to October"', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    await betweenReadAndWrite(() => handleUpdate(tap(row, 'a', 1)));
    const edits = () => tg.edited.filter((e) => e.msg.text === renderUpdatedPointer('he').text);

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600, replyTo: 500 }));

    expect(db.incomes).toHaveLength(1);
    expect(db.incomes[0].amount).toBe(1234567);
    expect(rowOf(db, row.id)).toMatchObject({ status: 'APPROVED', amount: 1234567, cardMessageId: 500 });
    expect(edits()).toHaveLength(0);
    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0].msg.text).toBe(renderNotice('he', 'alreadyAddedReply', { month: monthLabel('2026-10', 'he') }).text);
  });

  it('to a month tap → no card, and "reply to the newest card"', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    await betweenReadAndWrite(() =>
      handleUpdate(tapUpdate({ data: encodeCallback({ action: 'm', id: row.id, version: 1, arg: '2026-09' }), messageId: 500 }))
    );

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600, replyTo: 500 }));

    expect(rowOf(db, row.id)).toMatchObject({ status: 'OPEN', version: 2, amount: 1234567, month: '2026-09' });
    expect(tg.sent.map((s) => s.msg)).toEqual([notice('staleReply')]);
  });

  it('a card ✅-ed before its id is stored still ends on the new message as Added', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    const send = tg.sendMessage.getMockImplementation()!;
    tg.sendMessage.mockImplementationOnce(async (...args) => {
      const sent = await send(...args);
      await handleUpdate(tap(row, 'a', 2, sent.message_id));
      return sent;
    });

    await handleUpdate(textUpdate({ text: '12,500', messageId: 600, replyTo: 500 }));

    expect(db.incomes).toHaveLength(1);
    expect(db.incomes[0].amount).toBe(1250000);
    expect(rowOf(db, row.id).status).toBe('APPROVED');
    expect(screen(tg, FIRST_SENT_ID).text).toBe(
      renderAdded({
        locale: 'he', amount: 1250000, description: 'משכורת', month: '2026-10', percentage: 10, leftToPay: 50_000, appUrl: 'x',
      }).text
    );
    expect(tappedIds(screen(tg, FIRST_SENT_ID))).toEqual([]);
  });
});

describe('an amount that fails partway', () => {
  type Method = (...args: never[]) => Promise<unknown>;
  /** The fake client the flow runs against, so a test can make one of its calls fail. Call after setup(). */
  const fakeClient = async () =>
    (
      (await import('@/lib/prisma')) as unknown as {
        prisma: { pendingIncome: Record<'findFirst' | 'updateMany', Method>; groupPaymentSnapshot: { findFirst: Method } };
      }
    ).prisma;
  /** Shaped as Prisma's are. Its message names the server, so it must never reach a log. */
  const dbError = () =>
    Object.assign(new Error("Timed out fetching a new connection from the pool at db.internal:5432"), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2024',
    });
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it.each([
    ['reading the row', 'findFirst'],
    ['writing the amount', 'updateMany'],
  ] as const)("a database error %s → one notice, nothing changes, and the log has only the error's name and code", async (_, method) => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    vi.spyOn((await fakeClient()).pendingIncome, method).mockRejectedValueOnce(dbError());
    const errors = quiet();
    const before = structuredClone(db.pendingIncomes);
    const update = textUpdate({ text: '12,500', messageId: 600, replyTo: 500 });

    await handleUpdate(update);

    expect(db.pendingIncomes).toEqual(before);
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent).toEqual([{ chatId: BigInt(111), replyTo: 600, msg: notice('saveError') }]);
    expect(errors.mock.calls).toEqual([
      ['[salaryIntake:text]', 'PrismaClientKnownRequestError', 'P2024', update.update_id, undefined],
    ]);
  });

  it('a new card that cannot be rendered leaves the old card as it was, and the user hears so', async () => {
    const row = cardRow();
    const { db, tg, handleUpdate } = await setup({ pendingIncomes: [row] });
    // The card's month-paid check: a read the render makes after the amount is written.
    vi.spyOn((await fakeClient()).groupPaymentSnapshot, 'findFirst').mockRejectedValueOnce(dbError());
    const errors = quiet();
    const update = textUpdate({ text: '12,500', messageId: 600, replyTo: 500 });

    await handleUpdate(update);

    // The amount is written; only showing it failed.
    expect(rowOf(db, row.id)).toMatchObject({ status: 'OPEN', version: 2, amount: 1250000, cardMessageId: 500 });
    // Not "↓ updated": message 500 is still the row's card, so it keeps its buttons.
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent).toEqual([{ chatId: BigInt(111), replyTo: 600, msg: notice('saveError') }]);
    expect(errors.mock.calls).toEqual([
      ['[salaryIntake:text]', 'PrismaClientKnownRequestError', 'P2024', update.update_id, undefined],
    ]);

    // A tap there hears the card changed, records nothing, and sees the new amount.
    await handleUpdate(tap(row, 'a', 1, 500));

    expect(db.incomes).toHaveLength(0);
    expect(tg.answered.map((a) => a.text)).toEqual([toastText('he', 'changed')]);
    expect(screen(tg, 500)).toEqual(renderCard(cardView(rowOf(db, row.id))));
  });

  it('a typed card Telegram refuses → the notice; the row waits, and the next amount shows its card', async () => {
    const { db, tg, handleUpdate } = await setup();
    const { TelegramError } = await import('@/lib/telegramBot');
    tg.sendMessage.mockRejectedValueOnce(new TelegramError('sendMessage', 'Bad Gateway', 502));
    const errors = quiet();
    const update = textUpdate({ text: '12,500', messageId: 600 });

    await handleUpdate(update);

    expect(db.pendingIncomes).toHaveLength(1);
    const row = db.pendingIncomes[0];
    expect(row).toMatchObject({ status: 'OPEN', version: 1, amount: 1250000, cardMessageId: null });
    expect(tg.sent).toEqual([{ chatId: BigInt(111), replyTo: 600, msg: notice('saveError') }]);
    expect(errors.mock.calls).toEqual([['[salaryIntake:text]', 'TelegramError', 502, update.update_id, undefined]]);

    await handleUpdate(textUpdate({ text: '12,500', messageId: 601 }));

    expect(db.pendingIncomes).toHaveLength(1);
    expect(rowOf(db, row.id)).toMatchObject({ status: 'OPEN', version: 2, cardMessageId: FIRST_SENT_ID + 1 });
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent.at(-1)).toEqual({ chatId: BigInt(111), replyTo: 601, msg: renderCard(cardView(rowOf(db, row.id))) });
  });

  it('a card the deadline stops → the notice, which is sent past the deadline', async () => {
    const { tg, handleUpdate } = await setup();
    const errors = quiet();
    const update = textUpdate({ text: '12,500', messageId: 600 });

    await handleUpdate(update, Date.now() - 1);

    expect(tg.sent).toEqual([{ chatId: BigInt(111), replyTo: 600, msg: notice('saveError') }]);
    // A DOMException's code: 23 is TIMEOUT_ERR.
    expect(errors.mock.calls).toEqual([['[salaryIntake:text]', 'TimeoutError', 23, update.update_id, undefined]]);
  });

  it.each([
    ['the hint', 'hello', undefined],
    ['"reply to the newest card"', '12,500', 499],
  ] as const)('%s Telegram refuses once → the notice in its place', async (_, text, replyTo) => {
    const { tg, handleUpdate } = await setup({ pendingIncomes: [cardRow()] });
    const { TelegramError } = await import('@/lib/telegramBot');
    tg.sendMessage.mockRejectedValueOnce(new TelegramError('sendMessage', 'Bad Gateway', 502));
    const errors = quiet();
    const update = textUpdate({ text, messageId: 600, replyTo });

    await handleUpdate(update);

    expect(tg.sent).toEqual([{ chatId: BigInt(111), replyTo: 600, msg: notice('saveError') }]);
    expect(errors.mock.calls).toEqual([['[salaryIntake:text]', 'TelegramError', 502, update.update_id, undefined]]);
  });

  it('when even the notice cannot be sent, both failures are only logged', async () => {
    const { tg, handleUpdate } = await setup();
    const { TelegramError } = await import('@/lib/telegramBot');
    tg.sendMessage.mockRejectedValue(new TelegramError('sendMessage', 'Forbidden: bot was blocked by the user', 403));
    const errors = quiet();
    const update = textUpdate({ text: '12,500', messageId: 600 });

    await expect(handleUpdate(update)).resolves.toBeUndefined();

    const line = ['[salaryIntake:text]', 'TelegramError', 403, update.update_id, undefined];
    expect(errors.mock.calls).toEqual([line, line]);
  });
});

describe('an account that cannot be loaded', () => {
  /** Makes the next sender lookup fail as a database outage does. Call after setup(). */
  async function failSenderLookup() {
    const { prisma } = (await import('@/lib/prisma')) as unknown as {
      prisma: { user: { findUnique: (...args: never[]) => Promise<unknown> } };
    };
    vi.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(
      Object.assign(new Error('pool timeout at db.internal'), { code: 'P2024' })
    );
    return vi.spyOn(console, 'error').mockImplementation(() => {});
  }

  // Nothing has been answered yet when the sender is looked up, so a database
  // failure there must still end in a reply (spec success criterion 2).
  it.each([
    ['an amount', () => textUpdate({ text: '12,500', messageId: 600, languageCode: 'en' }), 'saveError'],
    ['a screenshot', () => photoUpdate({ messageId: 600, languageCode: 'en' }), 'readError'],
  ] as const)("%s → its handler's error, in Telegram's language, and no row", async (_, update, key) => {
    const { db, tg, reader, handleUpdate } = await setup();
    const errors = await failSenderLookup();
    const u = update();

    await handleUpdate(u);

    expect(db.pendingIncomes).toHaveLength(0);
    expect(reader).not.toHaveBeenCalled();
    expect(tg.sent).toEqual([{ chatId: BigInt(111), replyTo: 600, msg: notice(key, 'en') }]);
    expect(errors.mock.calls).toEqual([['[salaryIntake:update]', 'Error', 'P2024', u.update_id, undefined]]);
  });

  it('/start → the welcome all the same, which needs no account', async () => {
    const { tg, handleUpdate } = await setup();
    await failSenderLookup();

    await handleUpdate(textUpdate({ text: '/start', messageId: 600, languageCode: 'en' }));

    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0].msg.text).toBe(notice('welcome', 'en').text);
    expect(webAppUrls(tg.sent[0].msg)[0]).toMatch(/\/tg$/);
  });
});
