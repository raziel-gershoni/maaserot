import { localeFor, renderNotice, toastText, type Locale } from '../salaryCard';
import { answerCallbackQuery, sendMessage, type TgUpdate } from '../telegramBot';
import { handleCallback } from './callback';
import { appUrl, loadSender, logError, type Ctx, type Sender } from './context';
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
    let sender: Sender | null;
    try {
      sender = await loadSender(from.id);
    } catch (err) {
      logError('update', err, { updateId: update.update_id });
      return await unavailable(update, chatId, localeFor(null, from.language_code), deadline);
    }
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

/**
 * The database failed before the sender was known, so before anything was
 * answered. The update still gets its reply (spec success criterion 2), in
 * Telegram's language since the account's is unknown: a tap its one answer, a
 * screenshot or an amount the error its own handler gives when it fails, and
 * /start its welcome, which needs no account.
 */
async function unavailable(update: TgUpdate, chatId: bigint, locale: Locale, deadline: number): Promise<void> {
  const { message, callback_query: query } = update;
  if (query) return answerCallbackQuery(query.id, toastText(locale, 'error'));
  if (!message) return;
  if (isStart(message.text)) return handleStart(chatId, locale, deadline);
  const key = imageFileOf(message) ? 'readError' : message.text !== undefined ? 'saveError' : 'unsupportedFile';
  await sendMessage(chatId, renderNotice(locale, key), { replyTo: message.message_id, deadline });
}
