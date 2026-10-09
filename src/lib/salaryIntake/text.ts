import { parseAmount } from '../depositParsing';
import { israelDate, israelMonth } from '../israelTime';
import { defaultDescription, monthLabel, renderNotice, type BotNoticeKey, type Locale } from '../salaryCard';
import { sendMessage, type OutgoingMessage, type TgMessage } from '../telegramBot';
import { appUrl, logError, type Ctx, type Sender } from './context';
import { rowMessage, showPointer, showRow } from './render';
import {
  createTypedRow,
  deleteStaleRows,
  getRow,
  isExpired,
  newestOpenRow,
  rowForReply,
  setCardMessage,
  updateOpen,
  type Row,
  type RowData,
} from './rows';

/**
 * Typed messages (spec §5) and /start (spec Flow 1).
 *
 * A number either fixes a card's amount or starts a card. A reply names its
 * card, and the amount goes to that card's row or nowhere: had it fallen
 * through to another row, a reply to an old card would quietly change a
 * different deposit. A number sent on its own goes to the newest open card,
 * or starts one when there is none.
 *
 * The amount is one conditional write at the version the user saw, like a
 * tap. Only a write that won sends a card. One that lost (a ✅ or another
 * reply got there first) says what the row is now, so the chat never shows
 * two live cards for one row.
 */

export async function handleText(ctx: Ctx, message: TgMessage): Promise<void> {
  const { sender, chatId } = ctx;
  // Every return awaits, so a failure anywhere below reaches the catch.
  try {
    const amount = parseAmount((message.text ?? '').trim(), 'in');
    if (amount === null) return await say(ctx, message, renderNotice(sender.locale, 'hint'));

    // One clock for the checks and the write, so they agree on whether the card has expired.
    const now = ctx.now();
    const replyTo = message.reply_to_message?.message_id;
    const row =
      replyTo !== undefined ? await rowForReply(sender.id, chatId, replyTo) : await newestOpenRow(sender.id, chatId, now);
    if (row) return await setAmount(ctx, message, row, amount, now);
    if (replyTo !== undefined) return await say(ctx, message, answer(sender.locale, null, now));
    await startCard(ctx, message, amount, now);
  } catch (err) {
    // The database, a render, Telegram or the deadline failed. handleUpdate
    // would only log it, and the user, seeing no card, would not know to
    // send the amount again.
    logError('text', err, { updateId: ctx.updateId });
    try {
      // Not held to the deadline, which may be what just ran out: the time
      // between it and maxDuration is kept for this reply.
      await sendMessage(chatId, renderNotice(sender.locale, 'saveError'), { replyTo: message.message_id });
    } catch (e) {
      logError('text', e, { updateId: ctx.updateId });
    }
  }
}

/** For known and unknown senders alike, so there is no Ctx: only where to answer, and in which language. */
export async function handleStart(chatId: bigint, locale: Locale, deadline: number): Promise<void> {
  const msg = renderNotice(locale, 'welcome', {}, { kind: 'app', url: `${appUrl()}/tg`, label: 'openAppTg' });
  await sendMessage(chatId, msg, { deadline });
}

async function setAmount(ctx: Ctx, message: TgMessage, row: Row, amount: number, now: Date): Promise<void> {
  const { sender } = ctx;
  if (row.status !== 'OPEN' || isExpired(row, now)) return say(ctx, message, answer(sender.locale, row, now));

  const data: RowData =
    row.month !== null
      ? { amount }
      : // The picker: no deposit was chosen, so the amount is filed as a typed card would be.
        { amount, ...typedFiling(sender, message), dateFromImage: false };
  if ((await updateOpen(row.id, sender.id, row.version, now, data)) === 0) {
    // Lost a race. No card is sent or edited: the one on screen already
    // shows, or is about to show, the write that won.
    return say(ctx, message, answer(sender.locale, await getRow(row.id), now));
  }

  // Rendered before the old card is touched. Should the render fail, the old
  // card keeps its buttons and stays the row's card, so a tap there still
  // finds the row and shows the new amount.
  const fresh = await getRow(row.id);
  if (!fresh) return;
  const card = await rowMessage(fresh, sender, now);

  if (row.cardMessageId !== null) {
    try {
      await showPointer(ctx, row.cardMessageId);
    } catch (err) {
      // The user may have deleted that message. The new card matters more
      // than the old one losing its buttons, which a tap then finds stale anyway.
      logError('text', err, { updateId: ctx.updateId, pendingId: row.id });
    }
  }
  await sendCard(ctx, message, fresh, card);
}

/** A number with no card to go to: a card of its own, with no Claude call and no quota. */
async function startCard(ctx: Ctx, message: TgMessage, amount: number, now: Date): Promise<void> {
  const { sender, chatId } = ctx;
  // A typed card is a new card too, so it sweeps as a screenshot does.
  await deleteStaleRows(now);
  const row = await createTypedRow({
    userId: sender.id,
    chatId,
    sourceMessageId: message.message_id,
    now,
    amount,
    ...typedFiling(sender, message),
  });
  // A redelivered update: the first delivery sent the card.
  if (!row) return;
  await sendCard(ctx, message, row, await rowMessage(row, sender, now));
}

/**
 * A typed amount has no screen to date it, so it is filed by the Israeli day
 * the user sent it, as a screenshot with no date is. The card says so.
 */
function typedFiling(sender: Sender, message: TgMessage) {
  const sent = new Date(message.date * 1000);
  return {
    month: israelMonth(sent),
    depositDate: israelDate(sent),
    description: defaultDescription(sender.locale),
    // Captured now and shown on the card; approve records exactly this.
    percentage: sender.defaultPercent,
  };
}

/** Sends the row's card, already rendered, as a new message, and makes it the one replies and taps go to. */
async function sendCard(ctx: Ctx, message: TgMessage, row: Row, card: OutgoingMessage): Promise<void> {
  const { message_id } = await sendMessage(ctx.chatId, card, { replyTo: message.message_id, deadline: ctx.deadline });
  if ((await setCardMessage(row.id, message_id, ['OPEN'])) === 0) {
    // A tap closed the row while its card was on the way: the card shows how it ended.
    const fresh = await getRow(row.id);
    if (fresh) await showRow(ctx, message_id, fresh);
  }
}

/**
 * What an amount hears when its card cannot take it (spec §5's table): the
 * card it replied to is closed, or is no longer the row's current one.
 */
function answer(locale: Locale, row: Row | null, now: Date): OutgoingMessage {
  // Approve refuses a row without a month, so an added row always has one.
  if (row?.status === 'APPROVED' && row.month !== null) {
    return renderNotice(
      locale,
      'alreadyAddedReply',
      { month: monthLabel(row.month, locale) },
      { kind: 'app', url: `${appUrl()}/${locale}/income?month=${row.month}` }
    );
  }
  let key: BotNoticeKey = 'staleReply';
  if (row?.status === 'READING') key = 'stillReading';
  else if (row && (row.status === 'CANCELLED' || isExpired(row, now))) key = 'closedCard';
  return renderNotice(locale, key);
}

async function say(ctx: Ctx, message: TgMessage, msg: OutgoingMessage): Promise<void> {
  await sendMessage(ctx.chatId, msg, { replyTo: message.message_id, deadline: ctx.deadline });
}
