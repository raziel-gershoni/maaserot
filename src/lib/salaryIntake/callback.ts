import { answerCallbackQuery, type TgCallbackQuery } from '../telegramBot';
import { toastText } from '../salaryCard';
import { logError, type Ctx } from './context';

/**
 * A tap on a card's button (spec §4). Task 9 replaces this stub, which only
 * gives the tap its one answer, so the button stops spinning.
 */
export async function handleCallback(ctx: Ctx, query: TgCallbackQuery): Promise<void> {
  try {
    await answerCallbackQuery(query.id, toastText(ctx.sender.locale, 'invalid'));
  } catch (err) {
    logError('callback', err, { updateId: ctx.updateId });
  }
}
