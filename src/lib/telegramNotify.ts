import { formatCurrency } from './calculations';

const APP_URL = process.env.NEXTAUTH_URL || 'https://maaserot.vercel.app';

/**
 * Send a Telegram message with an optional "Open App" button.
 * Returns false silently if TELEGRAM_BOT_TOKEN is not configured.
 */
async function sendTelegramMessage(chatId: bigint, text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.log(`[DEV MODE] Would send Telegram message to ${chatId}: ${text}`);
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Open Maaserot', web_app: { url: APP_URL } }],
          ],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Telegram message failed:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Telegram message error:', error);
    return false;
  }
}

/**
 * Notify a partner that income was added.
 * Message is in the recipient's locale.
 */
export async function notifyPartnerIncomeAdded(
  partnerTelegramId: bigint,
  partnerLocale: string,
  senderName: string,
  incomeAmount: number,
  groupUnpaid: number,
): Promise<boolean> {
  const amount = formatCurrency(incomeAmount, partnerLocale);
  const unpaid = formatCurrency(groupUnpaid, partnerLocale);

  const text = partnerLocale === 'he'
    ? `${senderName} הוסיף/ה הכנסה של ${amount}.\nהמעשר שנותר לתשלום: ${unpaid}`
    : `${senderName} added ${amount} income.\nMaaser remaining: ${unpaid}`;

  return sendTelegramMessage(partnerTelegramId, text);
}

/**
 * Send a reminder to a partner asking them to add income.
 * Message is in the recipient's locale.
 */
export async function sendIncomeReminder(
  partnerTelegramId: bigint,
  partnerLocale: string,
  senderName: string,
  month: string,
): Promise<boolean> {
  const [y, m] = month.split('-');
  const monthLabel = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString(
    partnerLocale === 'he' ? 'he-IL' : 'en-US',
    { year: 'numeric', month: 'long' },
  );

  const text = partnerLocale === 'he'
    ? `${senderName} מבקש/ת שתוסיף/י הכנסות לחודש ${monthLabel}`
    : `${senderName} is asking you to add income for ${monthLabel}`;

  return sendTelegramMessage(partnerTelegramId, text);
}
