import { timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import { handleUpdate } from '@/lib/salaryIntake';
import type { TgUpdate } from '@/lib/telegramBot';

/**
 * Transport only. Authenticates Telegram, answers at once, and leaves the work
 * to after() so a slow screenshot read never makes Telegram retry the update.
 */
export const maxDuration = 60;
const WORK_BUDGET_MS = 50_000; // leaves time inside maxDuration for the last reply

function fromTelegram(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = request.headers.get('x-telegram-bot-api-secret-token');
  if (!expected || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!fromTelegram(request)) return new Response(null, { status: 401 });
  const startedAt = Date.now();
  let update: TgUpdate;
  try {
    update = await request.json();
  } catch {
    console.error('[telegram webhook] malformed body');
    return Response.json({ ok: true });
  }
  after(() => handleUpdate(update, startedAt + WORK_BUDGET_MS));
  return Response.json({ ok: true });
}
