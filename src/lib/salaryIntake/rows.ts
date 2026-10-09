import type { PendingIncome, PendingIncomeStatus, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import type { Candidate } from '../depositParsing';
import { CLEANUP_AFTER_MS, ROW_TTL_MS, limits } from './context';

/**
 * Every read and write of PendingIncome.
 *
 * A row is shared by up to three concurrent actors: the screenshot read, the
 * user's taps and the user's typed replies, which Telegram delivers on
 * separate queues. So every change here is conditional: it names the status
 * (and, once the card is out, the version) it expects, and reports a count.
 * A count of 0 means another actor got there first, and the caller renders
 * what the row is now instead of what it meant to make it.
 */

export type Row = PendingIncome;

/** The columns the flow sets on a row. Candidates are typed here; Prisma stores them as JSON. */
export type RowData = Partial<Pick<Row, 'amount' | 'month' | 'depositDate' | 'dateFromImage' | 'description' | 'percentage'>> & {
  candidates?: Candidate[];
};

/** How far back a re-sent screenshot is caught. */
const RESENT_WINDOW_MS = 10 * 60_000;

// Candidate is an interface, so it lacks the index signature Prisma's JSON
// input type asks for; the value itself is plain JSON.
const toJson = (candidates: Candidate[]) => candidates as unknown as Prisma.InputJsonValue;

function toUpdate(data: RowData) {
  const { candidates, ...columns } = data;
  return { ...columns, ...(candidates && { candidates: toJson(candidates) }) };
}

// Detected by code, not by `instanceof Prisma.PrismaClientKnownRequestError`:
// the code is what Prisma promises, and what the test fake throws.
const isUniqueConflict = (err: unknown) => (err as { code?: unknown } | null)?.code === 'P2002';

/**
 * Claims a screenshot before anything is spent on it. A unique conflict means
 * the update was redelivered, or the photo is a later item of an album whose
 * first item is already claimed: null, and the caller stops quietly.
 */
export async function claimImageRow(a: {
  userId: string; chatId: bigint; sourceMessageId: number; mediaGroupId: string | null; now: Date;
}): Promise<Row | null> {
  try {
    return await prisma.pendingIncome.create({
      data: {
        userId: a.userId,
        chatId: a.chatId,
        sourceMessageId: a.sourceMessageId,
        mediaGroupId: a.mediaGroupId,
        viaImage: true,
        status: 'READING',
        // The quota and the re-send check count by this, on the same clock as `now`.
        createdAt: a.now,
        expiresAt: new Date(a.now.getTime() + ROW_TTL_MS),
      },
    });
  } catch (err) {
    if (isUniqueConflict(err)) return null;
    throw err;
  }
}

/** A card started from a typed amount: open at once, with no Claude call and no quota. */
export async function createTypedRow(a: {
  userId: string; chatId: bigint; sourceMessageId: number; now: Date;
  amount: number; month: string; depositDate: string; description: string; percentage: number;
}): Promise<Row | null> {
  try {
    return await prisma.pendingIncome.create({
      data: {
        userId: a.userId,
        chatId: a.chatId,
        sourceMessageId: a.sourceMessageId,
        viaImage: false,
        status: 'OPEN',
        version: 1,
        candidates: [],
        amount: a.amount,
        month: a.month,
        depositDate: a.depositDate,
        dateFromImage: false,
        description: a.description,
        percentage: a.percentage,
        createdAt: a.now,
        expiresAt: new Date(a.now.getTime() + ROW_TTL_MS),
      },
    });
  } catch (err) {
    if (isUniqueConflict(err)) return null;
    throw err;
  }
}

/**
 * Cleanup without a cron job: each new card sweeps every row that expired
 * over a week ago. Everyone's, not just the sender's: a card left untapped
 * keeps its unchosen bank lines, and its owner may never send another one
 * (spec, Data kept). A row that long dead is safe to delete for anyone.
 */
export async function deleteStaleRows(now: Date): Promise<void> {
  await prisma.pendingIncome.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - CLEANUP_AFTER_MS) } },
  });
}

/**
 * Whether reading one more screenshot would go over a limit. The row just
 * claimed is already counted, so a limit of 10 lets the 10th through. A row
 * the quota refuses then leaves the counts; see refuseForQuota.
 */
export async function quotaExceeded(userId: string, now: Date): Promise<boolean> {
  const since = (ms: number) => ({ gt: new Date(now.getTime() - ms) });
  const hour = 3600_000, day = 24 * hour;
  const [userHour, userDay, everyone] = await Promise.all([
    prisma.pendingIncome.count({ where: { userId, viaImage: true, createdAt: since(hour) } }),
    prisma.pendingIncome.count({ where: { userId, viaImage: true, createdAt: since(day) } }),
    prisma.pendingIncome.count({ where: { viaImage: true, createdAt: since(day) } }),
  ]);
  const l = limits();
  return userHour > l.userHourly || userDay > l.userDaily || everyone > l.dailyTotal;
}

/**
 * Points the row at the message that now shows it. No version bump: the
 * buttons on that message were rendered at the current version.
 */
export async function setCardMessage(id: string, cardMessageId: number, statuses: Row['status'][]): Promise<number> {
  const { count } = await prisma.pendingIncome.updateMany({
    where: { id, status: { in: statuses } },
    data: { cardMessageId },
  });
  return count;
}

/** Ends a read: the row becomes a card or picker (OPEN), or ends without one (CANCELLED). */
export async function finishReading(id: string, data: RowData & { status: 'OPEN' | 'CANCELLED' }): Promise<number> {
  const { count } = await prisma.pendingIncome.updateMany({
    where: { id, status: 'READING' },
    data: {
      ...toUpdate(data),
      status: data.status,
      // Unchosen lines are kept only while a card is open (spec, Data kept).
      ...(data.status === 'CANCELLED' && { candidates: [] }),
      version: { increment: 1 },
    },
  });
  return count;
}

/**
 * Ends a read the quota refused, and takes the row out of the quota counts.
 * A refusal downloads and reads nothing, so it costs nothing; counted, one
 * sender's retries could fill the global limit and turn every user away for a
 * day, and keep their own hour full for as long as they kept retrying. The
 * row itself stays: a redelivery or a later photo of the same album must
 * still conflict with it and stop quietly.
 */
export async function refuseForQuota(id: string): Promise<number> {
  const { count } = await prisma.pendingIncome.updateMany({
    where: { id, status: 'READING' },
    data: { status: 'CANCELLED', viaImage: false, candidates: [], version: { increment: 1 } },
  });
  return count;
}

/** The one write a card's buttons and replies make: only to the card as it was rendered. */
function openAt(id: string, userId: string, version: number, now: Date) {
  return { id, userId, status: 'OPEN' as const, expiresAt: { gt: now }, version };
}

export async function updateOpen(id: string, userId: string, version: number, now: Date, data: RowData): Promise<number> {
  const { count } = await prisma.pendingIncome.updateMany({
    where: openAt(id, userId, version, now),
    data: { ...toUpdate(data), version: { increment: 1 } },
  });
  return count;
}

export async function cancelOpen(id: string, userId: string, version: number, now: Date): Promise<number> {
  const { count } = await prisma.pendingIncome.updateMany({
    where: openAt(id, userId, version, now),
    data: { status: 'CANCELLED', candidates: [], version: { increment: 1 } },
  });
  return count;
}

export async function getRow(id: string): Promise<Row | null> {
  return prisma.pendingIncome.findUnique({ where: { id } });
}

/** The row a reply was aimed at, in any status. Scoped to the sender and chat: message ids repeat across chats. */
export async function rowForReply(userId: string, chatId: bigint, cardMessageId: number): Promise<Row | null> {
  return prisma.pendingIncome.findFirst({
    where: { userId, chatId, cardMessageId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function newestOpenRow(userId: string, chatId: bigint, now: Date): Promise<Row | null> {
  return prisma.pendingIncome.findFirst({
    where: { userId, chatId, status: 'OPEN', expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
}

/** Another OPEN, unexpired card of this user for the same amount and month: a likely double. */
export async function otherOpenSameAmount(row: Row, now: Date): Promise<boolean> {
  const count = await prisma.pendingIncome.count({
    where: {
      userId: row.userId,
      id: { not: row.id },
      status: 'OPEN',
      expiresAt: { gt: now },
      amount: row.amount,
      month: row.month,
    },
  });
  return count > 0;
}

/**
 * The (amount, date) pairs a row was read with. Approve clears the unchosen
 * lines, so an approved row is left with only the one it added.
 */
function pairsOf(row: Row): Set<string> {
  const candidates = candidatesOf(row);
  if (candidates.length > 0) return new Set(candidates.map((c) => `${c.amount}|${c.date}`));
  return row.amount != null && row.depositDate != null ? new Set([`${row.amount}|${row.depositDate}`]) : new Set();
}

/**
 * A recent screenshot of the same screen: another OPEN or APPROVED row from a
 * screenshot in the last 10 minutes, read as the same set of deposits.
 */
export async function findResent(userId: string, exceptId: string, candidates: Candidate[], now: Date): Promise<Row | null> {
  const wanted = new Set(candidates.map((c) => `${c.amount}|${c.date}`));
  if (wanted.size === 0) return null;
  const statuses: PendingIncomeStatus[] = ['OPEN', 'APPROVED'];
  const rows = await prisma.pendingIncome.findMany({
    where: {
      userId,
      id: { not: exceptId },
      viaImage: true,
      status: { in: statuses },
      createdAt: { gte: new Date(now.getTime() - RESENT_WINDOW_MS) },
    },
  });
  const same = (row: Row) => {
    const pairs = pairsOf(row);
    return pairs.size === wanted.size && [...wanted].every((p) => pairs.has(p));
  };
  // The newest match is the card the user most likely has in view.
  return rows.filter(same).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

/** Past 48 h a card no longer acts; it says so when tapped. */
export function isExpired(row: Row, now: Date): boolean {
  return row.expiresAt.getTime() <= now.getTime();
}

export function candidatesOf(row: Row): Candidate[] {
  return Array.isArray(row.candidates) ? (row.candidates as unknown as Candidate[]) : [];
}
