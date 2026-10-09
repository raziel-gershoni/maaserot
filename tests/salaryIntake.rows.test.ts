import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma, type FakeDb, type FakePendingIncome } from './fakePrisma';
import { pendingRow } from './salaryIntakeHarness';
import type { Candidate } from '@/lib/depositParsing';

/**
 * The conditional writes the card's buttons and typed replies rely on. Each
 * must refuse a row that moved on (another version, another status, another
 * user, expired) and say so with a count of 0, which is what the flow
 * branches on. Run against the fake, which also rejects any `where` key the
 * real queries do not use.
 */

const NOW = new Date('2026-10-12T08:00:00Z');
const MIN = 60_000;

let db: FakeDb;

async function load(rows: FakePendingIncome[] = []) {
  vi.resetModules();
  const fake = createFakePrisma({ pendingIncomes: rows, now: () => NOW });
  db = fake.db;
  vi.doMock('@/lib/prisma', () => ({ prisma: fake.client }));
  return import('@/lib/salaryIntake/rows');
}

const candidate = (amount: number, date: string): Candidate => ({
  amount, date, month: date.slice(0, 7), dateFromImage: true, description: '', directionUnknown: false,
});

const open = (patch: Partial<FakePendingIncome> = {}) =>
  pendingRow({ status: 'OPEN', version: 3, createdAt: NOW, amount: 1000, month: '2026-10', depositDate: '2026-10-10', percentage: 10, ...patch });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTypedRow', () => {
  const typed = {
    userId: 'u1', chatId: BigInt(111), sourceMessageId: 5, now: NOW,
    amount: 1250000, month: '2026-10', depositDate: '2026-10-12', description: 'Salary', percentage: 10,
  };

  it('opens a card at version 1 that counts toward no quota', async () => {
    const rows = await load();

    const row = await rows.createTypedRow(typed);

    expect(row).toMatchObject({
      status: 'OPEN', version: 1, viaImage: false, dateFromImage: false, candidates: [],
      amount: 1250000, month: '2026-10', depositDate: '2026-10-12', percentage: 10,
    });
    expect(row!.expiresAt.getTime() - NOW.getTime()).toBe(48 * 3600_000);
  });

  it('returns null for a redelivered message', async () => {
    const rows = await load();
    await rows.createTypedRow(typed);

    await expect(rows.createTypedRow(typed)).resolves.toBeNull();
    expect(db.pendingIncomes).toHaveLength(1);
  });
});

describe('updateOpen and cancelOpen', () => {
  it.each([
    ['another version', { version: 2 }, 'u1', NOW],
    ['another user', {}, 'u2', NOW],
    ['a row that is no longer OPEN', { status: 'APPROVED' as const }, 'u1', NOW],
    ['an expired row', { expiresAt: NOW }, 'u1', NOW],
  ])('refuse %s', async (_, patch, userId, now) => {
    const row = open(patch);
    const rows = await load([row]);
    const before = { ...row };

    expect(await rows.updateOpen(row.id, userId, 3, now, { amount: 5 })).toBe(0);
    expect(await rows.cancelOpen(row.id, userId, 3, now)).toBe(0);
    expect(db.pendingIncomes[0]).toEqual(before);
  });

  it('updateOpen writes the data and bumps the version', async () => {
    const row = open();
    const rows = await load([row]);

    expect(await rows.updateOpen(row.id, 'u1', 3, NOW, { amount: 5, month: '2026-09' })).toBe(1);
    expect(db.pendingIncomes[0]).toMatchObject({ amount: 5, month: '2026-09', version: 4, status: 'OPEN' });
  });

  it('cancelOpen drops the unchosen lines', async () => {
    const row = open({ candidates: [candidate(1000, '2026-10-10'), candidate(2000, '2026-10-11')] });
    const rows = await load([row]);

    expect(await rows.cancelOpen(row.id, 'u1', 3, NOW)).toBe(1);
    expect(db.pendingIncomes[0]).toMatchObject({ status: 'CANCELLED', candidates: [], version: 4 });
  });
});

describe('finishReading and setCardMessage', () => {
  it('finishReading acts only on a READING row, and a cancel clears the candidates', async () => {
    const reading = pendingRow({ status: 'READING', version: 0 });
    const done = pendingRow({ status: 'OPEN', version: 1 });
    const rows = await load([reading, done]);

    expect(await rows.finishReading(done.id, { status: 'CANCELLED' })).toBe(0);
    expect(await rows.finishReading(reading.id, { status: 'CANCELLED', candidates: [candidate(1, '2026-10-01')] })).toBe(1);
    expect(db.pendingIncomes[0]).toMatchObject({ status: 'CANCELLED', version: 1, candidates: [] });
  });

  it('setCardMessage keeps the version, and only touches the statuses named', async () => {
    const row = open();
    const rows = await load([row]);

    expect(await rows.setCardMessage(row.id, 77, ['READING'])).toBe(0);
    expect(await rows.setCardMessage(row.id, 77, ['OPEN'])).toBe(1);
    expect(db.pendingIncomes[0]).toMatchObject({ cardMessageId: 77, version: 3 });
  });
});

describe('lookups', () => {
  it("rowForReply finds a row only in the sender's own chat", async () => {
    const mine = open({ cardMessageId: 500 });
    const theirs = open({ userId: 'u2', chatId: BigInt(222), cardMessageId: 500 });
    const rows = await load([mine, theirs]);

    expect((await rows.rowForReply('u1', BigInt(111), 500))?.id).toBe(mine.id);
    expect(await rows.rowForReply('u1', BigInt(222), 500)).toBeNull();
    expect(await rows.rowForReply('u1', BigInt(111), 501)).toBeNull();
  });

  it('newestOpenRow skips expired and closed rows', async () => {
    const older = open({ createdAt: new Date(NOW.getTime() - 30 * MIN) });
    const newer = open({ createdAt: new Date(NOW.getTime() - 10 * MIN) });
    const expired = open({ createdAt: new Date(NOW.getTime() - 5 * MIN), expiresAt: NOW });
    const approved = open({ createdAt: new Date(NOW.getTime() - MIN), status: 'APPROVED' });
    const rows = await load([older, newer, expired, approved]);

    expect((await rows.newestOpenRow('u1', BigInt(111), NOW))?.id).toBe(newer.id);
  });

  it('findResent matches the same set of deposits only, within 10 minutes', async () => {
    const a = candidate(1000, '2026-10-10'), b = candidate(2000, '2026-10-11');
    const picker = open({ amount: null, month: null, candidates: [a, b], createdAt: new Date(NOW.getTime() - 5 * MIN) });
    const old = open({ candidates: [a], createdAt: new Date(NOW.getTime() - 11 * MIN) });
    const rows = await load([picker, old]);

    expect((await rows.findResent('u1', 'new', [b, a], NOW))?.id).toBe(picker.id);
    expect(await rows.findResent('u1', 'new', [a], NOW)).toBeNull();
    expect(await rows.findResent('u1', picker.id, [a, b], NOW)).toBeNull();
    expect(await rows.findResent('u2', 'new', [a, b], NOW)).toBeNull();
  });
});
