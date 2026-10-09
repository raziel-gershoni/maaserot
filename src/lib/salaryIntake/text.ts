import { renderNotice, type Locale } from '../salaryCard';
import { sendMessage, type TgMessage } from '../telegramBot';
import type { Ctx } from './context';

/**
 * Typed messages (spec §5) and /start (spec Flow 1). Task 10 replaces these
 * stubs, which answer everything with the hint.
 */
export async function handleText(ctx: Ctx, message: TgMessage): Promise<void> {
  await sendMessage(ctx.chatId, renderNotice(ctx.sender.locale, 'hint'), {
    replyTo: message.message_id,
    deadline: ctx.deadline,
  });
}

/** For known and unknown senders alike, so there is no Ctx: only where to answer, and in which language. */
export async function handleStart(chatId: bigint, locale: Locale, deadline: number): Promise<void> {
  await sendMessage(chatId, renderNotice(locale, 'hint'), { deadline });
}
