import { formatCurrency } from './calculations';
import { monthLabel } from './israelTime';
import { isTelegramConfigured, sendMessage, TelegramError } from './telegramBot';

const APP_URL = process.env.NEXTAUTH_URL || 'https://maaserot.vercel.app';

/** The messages go out as HTML, and a name is the one part a user typed. */
function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Send a Telegram message with an "Open App" button to `buttonUrl`.
 * Returns false, without throwing, when the bot is not configured or Telegram
 * refuses.
 *
 * The logs carry the error's class and status and nothing else. The text holds
 * an income and the maaser still owed, and a fetch-level `TypeError` can quote
 * the request URL, which holds the bot token.
 */
async function sendTelegramMessage(
  chatId: bigint,
  text: string,
  locale: string,
  buttonUrl: string,
): Promise<boolean> {
  if (!isTelegramConfigured()) {
    console.log('[telegramNotify] not configured');
    return false;
  }

  const buttonText = locale === 'he' ? '📊 פתח מעשרות' : '📊 Open Maaserot';

  try {
    await sendMessage(
      chatId,
      {
        text,
        replyMarkup: { inline_keyboard: [[{ text: buttonText, web_app: { url: buttonUrl } }]] },
      },
      { parseMode: 'HTML' },
    );
    return true;
  } catch (e) {
    console.error(
      '[telegramNotify]',
      (e as { name?: unknown })?.name ?? (e as object)?.constructor?.name,
      e instanceof TelegramError ? e.status : undefined,
    );
    return false;
  }
}

/**
 * Notify a partner that income was added to `month`.
 * Message is in the recipient's locale.
 *
 * The month is named, and the button opens it, because it is no longer
 * always the current one: the bot files a deposit by the day it landed.
 */
export async function notifyPartnerIncomeAdded(
  partnerTelegramId: bigint,
  partnerLocale: string,
  senderName: string,
  incomeAmount: number,
  groupUnpaid: number,
  month: string,
): Promise<boolean> {
  const sender = escape(senderName);
  const amount = formatCurrency(incomeAmount, partnerLocale);
  const unpaid = formatCurrency(groupUnpaid, partnerLocale);
  const label = monthLabel(month, partnerLocale);

  const text = partnerLocale === 'he'
    ? `${sender} הוסיף/ה הכנסה של ${amount} ל${label}.\nנותר לתשלום ל${label}: ${unpaid}`
    : `${sender} added ${amount} income for ${label}.\nLeft to pay for ${label}: ${unpaid}`;

  return sendTelegramMessage(
    partnerTelegramId,
    text,
    partnerLocale,
    `${APP_URL}/${partnerLocale}/income?month=${month}`,
  );
}

/**
 * Send a reminder to a partner asking them to add income.
 * Message is in the recipient's locale.
 *
 * The button opens the current month rather than `month`: a reminder read
 * after the month turns would otherwise land on a month the form can no
 * longer add to.
 */
export async function sendIncomeReminder(
  partnerTelegramId: bigint,
  partnerLocale: string,
  senderName: string,
  month: string,
): Promise<boolean> {
  const sender = escape(senderName);
  const label = monthLabel(month, partnerLocale);

  const text = partnerLocale === 'he'
    ? `${sender} מבקש/ת שתוסיף/י הכנסות לחודש ${label}`
    : `${sender} is asking you to add income for ${label}`;

  return sendTelegramMessage(
    partnerTelegramId,
    text,
    partnerLocale,
    `${APP_URL}/${partnerLocale}/income`,
  );
}
