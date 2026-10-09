import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TelegramBot from '@/lib/telegramBot';
import { formatCurrency } from '@/lib/calculations';

/**
 * The partner notifications, with the Bot API client mocked. What matters
 * beyond the text is what reaches the logs: the message holds an income and
 * the maaser still owed, and a fetch-level error can quote the request URL,
 * which holds the bot token.
 */

const sendMessage = vi.fn();
const isTelegramConfigured = vi.fn();
let TelegramError: typeof TelegramBot.TelegramError;

const savedAppUrl = process.env.NEXTAUTH_URL;

async function load() {
  const actual = await vi.importActual<typeof TelegramBot>('@/lib/telegramBot');
  TelegramError = actual.TelegramError;
  vi.doMock('@/lib/telegramBot', () => ({
    sendMessage,
    isTelegramConfigured,
    TelegramError: actual.TelegramError,
  }));
  return import('@/lib/telegramNotify');
}

let log: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = 'https://app.test';
  isTelegramConfigured.mockReturnValue(true);
  sendMessage.mockResolvedValue({ message_id: 1 });
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (savedAppUrl === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = savedAppUrl;
  vi.restoreAllMocks();
});

describe('notifyPartnerIncomeAdded', () => {
  it('names the month, escapes the sender and deep-links to that month', async () => {
    const { notifyPartnerIncomeAdded } = await load();

    const sent = await notifyPartnerIncomeAdded(BigInt(99), 'en', 'Dana <b>&', 123456, 777, '2026-09');

    expect(sent).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(
      BigInt(99),
      {
        text: 'Dana &lt;b&gt;&amp; added ₪1,234.56 income for September 2026.\nLeft to pay for September: ₪7.77',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '📊 Open Maaserot', web_app: { url: 'https://app.test/en/income?month=2026-09' } }],
          ],
        },
      },
      { parseMode: 'HTML' }
    );
  });

  it('writes the Hebrew text in the partner locale', async () => {
    const { notifyPartnerIncomeAdded } = await load();

    await notifyPartnerIncomeAdded(BigInt(99), 'he', 'Dana', 123456, 777, '2026-09');

    const [, msg] = sendMessage.mock.lastCall!;
    expect(msg.text).toBe(
      `Dana הוסיף/ה הכנסה של ${formatCurrency(123456, 'he')} לספטמבר 2026.\n` +
        `נותר לתשלום לספטמבר: ${formatCurrency(777, 'he')}`
    );
    expect(msg.replyMarkup.inline_keyboard[0][0].web_app.url).toBe(
      'https://app.test/he/income?month=2026-09'
    );
  });

  describe('logs nothing it must not', () => {
    // Loaded before a test builds its error, so the TelegramError it throws is
    // the class the module under test checks against.
    let notify: () => Promise<boolean>;
    beforeEach(async () => {
      const { notifyPartnerIncomeAdded } = await load();
      notify = () => notifyPartnerIncomeAdded(BigInt(99), 'he', 'Dana', 123456, 777, '2026-09');
    });

    it('says only "not configured" when there is no bot token', async () => {
      isTelegramConfigured.mockReturnValue(false);

      await expect(notify()).resolves.toBe(false);

      expect(sendMessage).not.toHaveBeenCalled();
      for (const call of [...log.mock.calls, ...error.mock.calls]) {
        expect(call).toEqual(['[telegramNotify] not configured']);
      }
    });

    it('logs a refusal by class and status only', async () => {
      sendMessage.mockRejectedValue(
        new TelegramError('sendMessage', 'Forbidden: bot was blocked by the user', 403)
      );

      await expect(notify()).resolves.toBe(false);

      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith('[telegramNotify]', 'TelegramError', 403);
      expect(log).not.toHaveBeenCalled();
    });

    it('logs a fetch failure by class only, never its message', async () => {
      sendMessage.mockRejectedValue(
        new TypeError('Failed to parse URL from https://api.telegram.org/bot123:SECRET/sendMessage')
      );

      await expect(notify()).resolves.toBe(false);

      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith('[telegramNotify]', 'TypeError', undefined);
      expect(log).not.toHaveBeenCalled();
    });
  });
});

describe('sendIncomeReminder', () => {
  it('goes through the bot client with the sender escaped', async () => {
    const { sendIncomeReminder } = await load();

    const sent = await sendIncomeReminder(BigInt(99), 'en', 'Dana <b>', '2026-09');

    expect(sent).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(
      BigInt(99),
      {
        text: 'Dana &lt;b&gt; is asking you to add income for September 2026',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '📊 Open Maaserot', web_app: { url: 'https://app.test/en/income' } }],
          ],
        },
      },
      { parseMode: 'HTML' }
    );
  });
});
