import { localeFor, renderNotice } from '../salaryCard';
import { answerCallbackQuery, sendMessage, type TgUpdate } from '../telegramBot';
import { handleCallback } from './callback';
import { appUrl, loadSender, logError, type Ctx } from './context';
import { handleImage, imageFileOf } from './image';
import { handleStart, handleText } from './text';

/**
 * The bot's flow: a Telegram update in, a reply out.
 *
 * The webhook runs this inside `after()`, where a throw is only logged by
 * Next and the user hears nothing. So this never throws, and it is where the
 * three things every update needs are settled once: that it came from a
 * private chat, who sent it, and which handler it is for.
 */

/** Telegram's limit on a callback answer's text. */
const MAX_TOAST = 200;

const isStart = (text?: string) => /^\/start(?:@\w+)?(?:\s|$)/.test(text ?? '');

export async function handleUpdate(update: TgUpdate, deadline: number): Promise<void> {
  try {
    const message = update?.message;
    const query = update?.callback_query;
    const chat = message?.chat ?? query?.message?.chat;
    const from = message?.from ?? query?.from;
    // A group could otherwise see one member's incomes on a card.
    if (!chat || chat.type !== 'private' || !from) return;

    const chatId = BigInt(chat.id);
    const sender = await loadSender(from.id);
    const locale = sender?.locale ?? localeFor(null, from.language_code);

    if (message && isStart(message.text)) return await handleStart(chatId, locale, deadline);

    if (!sender) {
      const msg = renderNotice(locale, 'unknownSender', {}, { kind: 'app', url: `${appUrl()}/tg`, label: 'openAppTg' });
      if (query) {
        // A tap gets one answer, and for an unknown account it is this same text.
        try {
          await answerCallbackQuery(query.id, [...msg.text].slice(0, MAX_TOAST).join(''));
        } catch (err) {
          logError('update', err, { updateId: update.update_id });
        }
      }
      await sendMessage(chatId, msg, { deadline });
      return;
    }

    const ctx: Ctx = { sender, chatId, updateId: update.update_id, deadline, now: () => new Date() };
    if (query) return await handleCallback(ctx, query);
    if (!message) return;
    if (imageFileOf(message)) return await handleImage(ctx, message);
    if (message.text !== undefined) return await handleText(ctx, message);
    // Another kind of file, a sticker, a voice note: nothing to read.
    await sendMessage(chatId, renderNotice(locale, 'unsupportedFile'), { replyTo: message.message_id, deadline });
  } catch (err) {
    logError('update', err, { updateId: (update as TgUpdate | null)?.update_id });
  }
}
