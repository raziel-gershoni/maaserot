import { vi } from 'vitest';
import {
  createFakePrisma,
  type FakeDb,
  type FakePartnership,
  type FakePendingIncome,
  type FakeUser,
} from './fakePrisma';
import type { RawTransaction, Reading } from '@/lib/depositParsing';
import type { ImageMediaType, ReadResult } from '@/lib/depositReader';
import type { OutgoingMessage, TgUpdate } from '@/lib/telegramBot';

/**
 * The bot's flow end to end, with nothing real underneath it: the database is
 * the in-memory fake, Telegram is a recorder, and Claude is a `vi.fn` the test
 * sets. Tests drive it with the updates Telegram would send and assert on the
 * rows left behind and the messages sent or edited.
 *
 * Shared by the image, callback and text tests, so each module's tests see
 * the same mocks and the same two users.
 */

export const u1: FakeUser = { id: 'u1', name: 'Avi', telegramId: BigInt(111), locale: 'he', defaultPercent: 10 };
export const u2: FakeUser = { id: 'u2', name: 'Dana', telegramId: BigInt(222), locale: 'he', defaultPercent: 10 };
const partnership: FakePartnership = { id: 'p1', user1Id: 'u1', user2Id: 'u2', status: 'ACCEPTED' };

/** The first `message_id` the recorder hands out; placeholders and cards count up from here. */
export const FIRST_SENT_ID = 1000;

/** A JPEG's magic bytes, then padding: enough for the reader's sniffing. */
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

export interface Sent { chatId: bigint | number; msg: OutgoingMessage; replyTo?: number }
export interface Edited { chatId: bigint | number; messageId: number; msg: OutgoingMessage }
export interface Answered { id: string; text?: string }

/** Fixes `Date` only, so promises and the SDK's own timers still run. */
export function fixClock(iso = '2026-10-12T08:00:00Z') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

export async function setup(seed: Partial<FakeDb> = {}) {
  vi.resetModules();
  const fake = createFakePrisma({
    users: [{ ...u1 }, { ...u2 }],
    partnerships: [{ ...partnership }],
    ...seed,
    now: () => new Date(),
  });

  // Like the real client, a send or an edit whose deadline has passed aborts.
  const checkDeadline = (opts?: { deadline?: number }) => {
    if (opts?.deadline !== undefined && opts.deadline <= Date.now()) {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }
  };

  let nextMessageId = FIRST_SENT_ID;
  const sent: Sent[] = [];
  const edited: Edited[] = [];
  const answered: Answered[] = [];
  const tg = {
    sent,
    edited,
    answered,
    /** Set to make every answerCallbackQuery reject after it is recorded. */
    rejectAnswers: false,
    sendMessage: vi.fn(
      async (chatId: bigint | number, msg: OutgoingMessage, opts: { replyTo?: number; deadline?: number } = {}) => {
        checkDeadline(opts);
        sent.push({ chatId, msg, replyTo: opts.replyTo });
        return { message_id: nextMessageId++ };
      }
    ),
    editMessageText: vi.fn(
      async (chatId: bigint | number, messageId: number, msg: OutgoingMessage, opts: { deadline?: number } = {}) => {
        checkDeadline(opts);
        edited.push({ chatId, messageId, msg });
      }
    ),
    answerCallbackQuery: vi.fn(async (id: string, text?: string) => {
      answered.push({ id, text });
      if (tg.rejectAnswers) throw new Error('answer failed');
    }),
    sendChatAction: vi.fn(async () => {}),
    getFile: vi.fn(async () => ({ file_path: 'p', file_size: 1000 })),
    downloadFile: vi.fn(async () => JPEG),
  };

  const reader = vi.fn<(image: Buffer, mediaType: ImageMediaType, deadline: number) => Promise<ReadResult>>(
    async () => ({ kind: 'ok', reading: reading() })
  );
  const notify = vi.fn<(userId: string, month: string, amount: number) => Promise<void>>(async () => {});

  vi.doMock('@/lib/prisma', () => ({ prisma: fake.client }));
  vi.doMock('@/lib/telegramBot', async () => ({
    ...(await vi.importActual<typeof import('@/lib/telegramBot')>('@/lib/telegramBot')),
    // Nothing may reach api.telegram.org, even a call the flow should not make.
    callTelegram: vi.fn(async () => {
      throw new Error('callTelegram called in a test');
    }),
    sendMessage: tg.sendMessage,
    editMessageText: tg.editMessageText,
    answerCallbackQuery: tg.answerCallbackQuery,
    sendChatAction: tg.sendChatAction,
    getFile: tg.getFile,
    downloadFile: tg.downloadFile,
  }));
  vi.doMock('@/lib/depositReader', () => ({ readDeposits: reader }));
  vi.doMock('@/lib/monthState', () => ({ calculateGroupMonthState: vi.fn(async () => ({ unpaid: 50_000 })) }));
  vi.doMock('@/lib/incomes', async () => ({
    ...(await vi.importActual<typeof import('@/lib/incomes')>('@/lib/incomes')),
    notifyPartnerOfIncome: notify,
  }));

  const mod = await import('@/lib/salaryIntake');
  const handleUpdate = (update: TgUpdate, deadline = Date.now() + 50_000) => mod.handleUpdate(update, deadline);

  return { db: fake.db, tg, reader, notify, handleUpdate };
}

// ---------------------------------------------------------------------------
// Updates, as Telegram sends them. `date` is Unix seconds.
// ---------------------------------------------------------------------------

let updateSeq = 0;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const from = (id: number, languageCode?: string) => ({ id, ...(languageCode && { language_code: languageCode }) });

interface From { fromId?: number; chatId?: number; languageCode?: string }

export function photoUpdate(o: From & { messageId: number; date?: number; mediaGroupId?: string }): TgUpdate {
  const fromId = o.fromId ?? 111;
  return {
    update_id: ++updateSeq,
    message: {
      message_id: o.messageId,
      date: o.date ?? nowSeconds(),
      chat: { id: o.chatId ?? fromId, type: 'private' },
      from: from(fromId, o.languageCode),
      // Telegram lists several sizes of the same photo; the largest is the one to read.
      photo: [
        { file_id: 'photo-small', width: 90, height: 160 },
        { file_id: 'photo-large', width: 1080, height: 1920 },
        { file_id: 'photo-medium', width: 320, height: 568 },
      ],
      ...(o.mediaGroupId && { media_group_id: o.mediaGroupId }),
    },
  };
}

export function textUpdate(o: From & { text: string; messageId: number; date?: number; replyTo?: number }): TgUpdate {
  const fromId = o.fromId ?? 111;
  return {
    update_id: ++updateSeq,
    message: {
      message_id: o.messageId,
      date: o.date ?? nowSeconds(),
      chat: { id: o.chatId ?? fromId, type: 'private' },
      from: from(fromId, o.languageCode),
      text: o.text,
      ...(o.replyTo !== undefined && { reply_to_message: { message_id: o.replyTo } }),
    },
  };
}

export function tapUpdate(o: From & { data: string; messageId: number }): TgUpdate {
  const fromId = o.fromId ?? 111;
  return {
    update_id: ++updateSeq,
    callback_query: {
      id: `query-${updateSeq}`,
      from: from(fromId, o.languageCode),
      data: o.data,
      message: { message_id: o.messageId, date: nowSeconds(), chat: { id: o.chatId ?? fromId, type: 'private' } },
    },
  };
}

// ---------------------------------------------------------------------------
// What the model reads, and rows already in the database
// ---------------------------------------------------------------------------

/** One screen line; by default an incoming salary of ₪12,345.67 on 10/10. */
export function line(patch: Partial<RawTransaction> = {}): RawTransaction {
  return {
    amountText: '+12,345.67',
    direction: 'in',
    currency: 'ILS',
    day: 10,
    month: 10,
    year: null,
    relativeDay: null,
    description: 'ACME Ltd',
    ...patch,
  };
}

export function reading(transactions: RawTransaction[] = [line()]): Reading {
  return { isBankScreen: true, transactions };
}

let rowSeq = 0;

/** A PendingIncome already in the table. Its id is cuid-shaped, so callback_data can carry it. */
export function pendingRow(patch: Partial<FakePendingIncome> = {}): FakePendingIncome {
  const createdAt = patch.createdAt ?? new Date();
  return {
    id: `cseed${String(++rowSeq).padStart(20, '0')}`,
    userId: 'u1',
    chatId: BigInt(111),
    sourceMessageId: 900_000 + rowSeq,
    mediaGroupId: null,
    viaImage: true,
    cardMessageId: null,
    candidates: [],
    amount: null,
    month: null,
    depositDate: null,
    dateFromImage: true,
    description: null,
    percentage: null,
    status: 'CANCELLED',
    version: 1,
    incomeId: null,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 48 * 3600_000),
    ...patch,
  };
}
