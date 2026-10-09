import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  answerCallbackQuery,
  callTelegram,
  downloadFile,
  editMessageText,
  getFile,
  isNotModified,
  isTelegramConfigured,
  sendChatAction,
  sendMessage,
  TelegramError,
} from '@/lib/telegramBot';

// The real client against a stubbed fetch: nothing here reaches Telegram, and
// the token is a fake whose secret half is easy to search for in errors.
const TOKEN = '123:SECRET';

type FetchArgs = [url: string, init: RequestInit];
const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function lastCall() {
  const [url, init] = fetchMock.mock.lastCall!;
  return { url, init };
}

function lastBody() {
  return JSON.parse(String(lastCall().init.body)) as Record<string, unknown>;
}

/** A fetch that only ever settles by being aborted, as a hung connection does. */
function hang(_url: string, init: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

function expectNoSecret(e: unknown) {
  expect(e).toBeInstanceOf(TelegramError);
  const err = e as TelegramError;
  expect(err.message).not.toContain('SECRET');
  expect(err.description).not.toContain('SECRET');
  expect(String(err.stack)).not.toContain('SECRET');
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  vi.unstubAllGlobals();
});

describe('callTelegram', () => {
  it('posts JSON to the method and sends a bigint chat id as a string', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, result: { message_id: 7 } }));

    await expect(sendMessage(BigInt(123), { text: 'hi' })).resolves.toEqual({ message_id: 7 });

    const { url, init } = lastCall();
    expect(url.endsWith('/sendMessage')).toBe(true);
    expect(init.method).toBe('POST');
    // The URL holds the token: never a key in Next's data cache.
    expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(String(init.body)).toContain('"chat_id":"123"');
  });

  it('rejects an { ok: false } reply with a TelegramError that does not carry the token', async () => {
    fetchMock.mockResolvedValue(reply({ ok: false, description: 'Bad Request: x' }, 400));

    const e = await rejection(sendMessage(BigInt(123), { text: 'hi' }));

    expectNoSecret(e);
    expect(e).toMatchObject({ method: 'sendMessage', description: 'Bad Request: x', status: 400 });
  });

  // Telegram's error contract is the body's `ok`, not the status.
  it('rejects an { ok: false } reply even with a 200', async () => {
    fetchMock.mockResolvedValue(reply({ ok: false, description: 'Bad Request: chat not found' }, 200));

    const e = await rejection(callTelegram('getMe', {}));

    expectNoSecret(e);
    expect(e).toMatchObject({ method: 'getMe', description: 'Bad Request: chat not found', status: 200 });
  });

  it('names the HTTP status when the reply is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));

    const e = await rejection(callTelegram('getMe', {}));

    expectNoSecret(e);
    expect(e).toMatchObject({ description: 'HTTP 502', status: 502 });
  });

  it('aborts a hung call after timeoutMs', async () => {
    fetchMock.mockImplementation(hang);
    const started = Date.now();

    await expect(callTelegram('getMe', {}, { timeoutMs: 20 })).rejects.toMatchObject({ name: 'TimeoutError' });

    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('aborts a hung call at the deadline, well before the default timeout', async () => {
    fetchMock.mockImplementation(hang);
    const started = Date.now();

    await expect(callTelegram('getMe', {}, { deadline: Date.now() + 20 })).rejects.toMatchObject({ name: 'TimeoutError' });

    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('throws "not configured" without calling fetch when the token is unset', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    expect(isTelegramConfigured()).toBe(false);
    const e = await rejection(callTelegram('getMe', {}));

    expect(e).toMatchObject({ method: 'getMe', description: 'not configured', status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sendMessage', () => {
  it('sends only the options it is given', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, result: { message_id: 7 } }));

    await sendMessage(BigInt(123), { text: 'hi' });

    expect(lastBody()).toEqual({ chat_id: '123', text: 'hi' });
  });

  it('replies to a message, with a keyboard and HTML', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, result: { message_id: 7 } }));
    const keyboard = { inline_keyboard: [[{ text: 'Open', web_app: { url: 'https://x/he/income' } }]] };

    await sendMessage(BigInt(123), { text: '<b>hi</b>', replyMarkup: keyboard }, { replyTo: 9, parseMode: 'HTML' });

    expect(lastBody()).toEqual({
      chat_id: '123',
      text: '<b>hi</b>',
      reply_markup: keyboard,
      parse_mode: 'HTML',
      reply_parameters: { message_id: 9, allow_sending_without_reply: true },
    });
  });
});

describe('editMessageText', () => {
  it('swallows "message is not modified"', async () => {
    fetchMock.mockResolvedValue(
      reply({ ok: false, description: 'Bad Request: message is not modified' }, 400),
    );

    await expect(editMessageText(BigInt(123), 5, { text: 'same' })).resolves.toBeUndefined();
  });

  it('still rejects any other failure', async () => {
    fetchMock.mockResolvedValue(reply({ ok: false, description: 'Bad Request: message to edit not found' }, 400));

    const e = await rejection(editMessageText(BigInt(123), 5, { text: 'x' }));

    expect(e).toBeInstanceOf(TelegramError);
    expect(isNotModified(e)).toBe(false);
  });

  it('removes the buttons when the message has no keyboard', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, result: true }));

    await editMessageText(BigInt(123), 5, { text: 'done' });

    expect(lastBody()).toEqual({
      chat_id: '123',
      message_id: 5,
      text: 'done',
      reply_markup: { inline_keyboard: [] },
    });
  });

  it('sends the keyboard it is given', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, result: true }));
    const keyboard = { inline_keyboard: [[{ text: '✅', callback_data: 'a' }]] };

    await editMessageText(BigInt(123), 5, { text: 'card', replyMarkup: keyboard });

    expect(lastBody().reply_markup).toEqual(keyboard);
  });
});

describe('answerCallbackQuery and sendChatAction', () => {
  it('answers a tap with its text, or with none', async () => {
    fetchMock.mockImplementation(async () => reply({ ok: true, result: true }));

    await answerCallbackQuery('q1', 'Not yours');
    expect(lastCall().url.endsWith('/answerCallbackQuery')).toBe(true);
    expect(lastBody()).toEqual({ callback_query_id: 'q1', text: 'Not yours' });

    await answerCallbackQuery('q2');
    expect(lastBody()).toEqual({ callback_query_id: 'q2' });
  });

  it('sends a chat action to the chat, with a bigint id as a string', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, result: true }));

    await sendChatAction(BigInt(123), 'typing');

    expect(lastCall().url.endsWith('/sendChatAction')).toBe(true);
    expect(lastBody()).toEqual({ chat_id: '123', action: 'typing' });
  });
});

describe('getFile', () => {
  it('returns the path and size', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, result: { file_id: 'f', file_path: 'photos/a.jpg', file_size: 10 } }));

    await expect(getFile('f')).resolves.toEqual({ file_path: 'photos/a.jpg', file_size: 10 });
    expect(lastBody()).toEqual({ file_id: 'f' });
  });

  it('rejects a file with no path, since there is nothing to download', async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, result: { file_id: 'f' } }));

    await expect(getFile('f')).rejects.toBeInstanceOf(TelegramError);
  });
});

describe('downloadFile', () => {
  it('fetches the file path and returns its bytes', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));

    const buf = await downloadFile('photos/file_1.jpg', { maxBytes: 3 });

    expect([...buf]).toEqual([1, 2, 3]);
    expect(lastCall().url).toBe(`https://api.telegram.org/file/bot${TOKEN}/photos/file_1.jpg`);
    expect(lastCall().init.cache).toBe('no-store');
  });

  it('rejects with 413 once the received size exceeds maxBytes', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4])));

    const e = await rejection(downloadFile('photos/file_1.jpg', { maxBytes: 3 }));

    expectNoSecret(e);
    expect(e).toMatchObject({ method: 'download', description: 'too large', status: 413 });
  });

  it('rejects with 413 on a content-length over maxBytes, before reading the body', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2]), { headers: { 'content-length': '1000' } }),
    );

    const e = await rejection(downloadFile('photos/file_1.jpg', { maxBytes: 3 }));

    expect(e).toMatchObject({ method: 'download', status: 413 });
  });

  it('names the HTTP status of a failed download without the file URL', async () => {
    fetchMock.mockResolvedValue(new Response('Not Found', { status: 404 }));

    const e = await rejection(downloadFile('photos/file_1.jpg'));

    expectNoSecret(e);
    expect((e as TelegramError).message).not.toContain('file_1');
    expect(e).toMatchObject({ method: 'download', description: 'HTTP 404', status: 404 });
  });
});
