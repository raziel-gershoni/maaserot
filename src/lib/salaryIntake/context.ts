import { prisma } from '../prisma';
import { localeFor, type Locale } from '../salaryCard';

/**
 * What every handler of the bot's flow is given, and the few rules they all
 * share: who the sender is, how long a row lives, how much reading a user may
 * cost, and the one way an error is logged.
 */

/** The account a Telegram sender signs in to the Mini App with. */
export interface Sender { id: string; name: string | null; locale: Locale; defaultPercent: number }

export interface Ctx {
  sender: Sender;
  chatId: bigint;
  /** The update's `update_id`, so a logged error can be traced to it. */
  updateId: number;
  /** Epoch ms by which the reply must be out; `after()` is cut off at `maxDuration`. */
  deadline: number;
  now: () => Date;
}

/** A row the user leaves alone is dead after 48 h, and deleted a week after that. */
export const ROW_TTL_MS = 48 * 3600_000;
export const CLEANUP_AFTER_MS = 7 * 24 * 3600_000;

/**
 * Only accounts made by the Mini App sign-in have a `telegramId`. There is no
 * email-to-Telegram linking, so an email-only account is invisible here.
 */
export async function loadSender(telegramId: number): Promise<Sender | null> {
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { id: true, name: true, locale: true, defaultPercent: true },
  });
  if (!user) return null;
  return { id: user.id, name: user.name, locale: localeFor(user), defaultPercent: user.defaultPercent };
}

/**
 * The only way the flow logs an error: its name, its code or status, and the
 * two ids. Never the error itself, its message, stack or cause. Not every
 * failure is a TelegramError: a fetch-level TypeError can quote the request
 * URL, and that URL holds the bot token. Messages also carry amounts and
 * names the user sent, which have no place in a log.
 */
export function logError(scope: string, err: unknown, ids?: { updateId?: number; pendingId?: string }): void {
  console.error(`[salaryIntake:${scope}]`, (err as {name?: unknown})?.name ?? (err as object)?.constructor?.name, (err as {code?: unknown})?.code ?? (err as {status?: unknown})?.status, ids?.updateId, ids?.pendingId);
}

/** A non-negative integer from the environment, or the default. An empty or mistyped value must not mean 0. */
function envLimit(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  return raw && /^\d+$/.test(raw) ? Number(raw) : fallback;
}

/** Screenshot reads allowed, counting the one being claimed. Read per call, so a changed env applies at once. */
export function limits(): { userHourly: number; userDaily: number; dailyTotal: number } {
  return {
    userHourly: envLimit('SALARY_INTAKE_USER_HOURLY', 10),
    userDaily: envLimit('SALARY_INTAKE_USER_DAILY', 30),
    dailyTotal: envLimit('SALARY_INTAKE_DAILY_LIMIT', 200),
  };
}

export function appUrl(): string {
  return process.env.NEXTAUTH_URL || 'https://maaserot.vercel.app';
}
