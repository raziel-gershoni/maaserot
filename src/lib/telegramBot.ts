/**
 * The Telegram Bot API client — every call the bot makes goes through here.
 *
 * Two things this module exists to guarantee:
 *
 *  - The token never leaves it. The token is part of every request URL, so a
 *    URL in an error message or a log line is a leaked bot. Errors carry only
 *    the method, Telegram's own description and the HTTP status.
 *  - Every call is bounded. The webhook does its work in `after()`, which
 *    shares the route's `maxDuration` and is not retried; a hung request would
 *    eat the budget the user's reply needs. Each call has its own timeout, and
 *    an optional `deadline` (epoch ms) cuts it shorter still.
 */

const API = 'https://api.telegram.org';

export interface TgUser { id: number; is_bot?: boolean; language_code?: string; first_name?: string }
export interface TgChat { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' }
export interface TgPhotoSize { file_id: string; width: number; height: number; file_size?: number }
export interface TgDocument { file_id: string; mime_type?: string; file_size?: number }
export interface TgMessage {
  message_id: number; date: number; chat: TgChat; from?: TgUser; text?: string;
  photo?: TgPhotoSize[]; document?: TgDocument; media_group_id?: string;
  reply_to_message?: { message_id: number; from?: TgUser };
}
export interface TgCallbackQuery {
  id: string; from: TgUser; data?: string;
  message?: { message_id: number; date: number; chat: TgChat };
}
export interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallbackQuery }
export interface InlineButton { text: string; callback_data?: string; web_app?: { url: string } }
export interface InlineKeyboard { inline_keyboard: InlineButton[][] }
export interface OutgoingMessage { text: string; replyMarkup?: InlineKeyboard }

export class TelegramError extends Error {
  constructor(
    public readonly method: string,
    public readonly description: string,
    public readonly status: number
  ) {
    super(`Telegram ${method}: ${description}`);
    this.name = 'TelegramError';
  }
}

/** Editing a message to exactly what it already shows is an error to Telegram, and a no-op to us. */
export function isNotModified(e: unknown): boolean {
  return e instanceof TelegramError && e.description.includes('message is not modified');
}

export function isTelegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

function signalFor(timeoutMs: number, deadline?: number): AbortSignal {
  return AbortSignal.any([
    AbortSignal.timeout(timeoutMs),
    ...(deadline ? [AbortSignal.timeout(Math.max(1, deadline - Date.now()))] : []),
  ]);
}

/** Chat ids are BigInt in the database, and JSON.stringify throws on a bigint. */
function toJson(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export async function callTelegram<T>(
  method: string,
  payload: Record<string, unknown>,
  opts: { timeoutMs?: number; deadline?: number } = {}
): Promise<T> {
  // Read per call, not at import: tests set it per case, and a missing token
  // must be a handled error rather than a request to `/botundefined/`.
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError(method, 'not configured', 0);

  const res = await fetch(`${API}/bot${token}/${method}`, {
    // Never Next's data cache: the URL holds the token, and a cache would key on it.
    cache: 'no-store',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: toJson(payload),
    signal: signalFor(opts.timeoutMs ?? 5000, opts.deadline),
  });

  // A proxy in front of Telegram can answer a 502 with an HTML page. Parse
  // leniently so that surfaces as the status, not as a SyntaxError quoting
  // the page. An abort while reading the body still rejects as an abort.
  const text = await res.text();
  let json: { ok?: boolean; result?: T; description?: string } | null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok || !json?.ok) {
    throw new TelegramError(method, json?.description ?? `HTTP ${res.status}`, res.status);
  }
  return json.result as T;
}

export async function sendMessage(
  chatId: bigint | number,
  msg: OutgoingMessage,
  opts: { replyTo?: number; deadline?: number; parseMode?: 'HTML' } = {}
): Promise<{ message_id: number }> {
  const sent = await callTelegram<TgMessage>(
    'sendMessage',
    {
      chat_id: chatId,
      text: msg.text,
      ...(msg.replyMarkup && { reply_markup: msg.replyMarkup }),
      ...(opts.parseMode && { parse_mode: opts.parseMode }),
      // The user may delete the message being replied to before we answer;
      // the answer still matters more than the thread.
      ...(opts.replyTo && {
        reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true },
      }),
    },
    { deadline: opts.deadline }
  );
  return { message_id: sent.message_id };
}

export async function editMessageText(
  chatId: bigint | number,
  messageId: number,
  msg: OutgoingMessage,
  opts: { deadline?: number } = {}
): Promise<void> {
  try {
    await callTelegram(
      'editMessageText',
      {
        chat_id: chatId,
        message_id: messageId,
        text: msg.text,
        // Omitting reply_markup leaves the old buttons in place, so a card
        // that reached a final state would still offer ✅. An empty keyboard
        // removes them.
        reply_markup: msg.replyMarkup ?? { inline_keyboard: [] },
      },
      { deadline: opts.deadline }
    );
  } catch (e) {
    if (!isNotModified(e)) throw e;
  }
}

export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  await callTelegram('answerCallbackQuery', { callback_query_id: id, ...(text && { text }) });
}

export async function sendChatAction(chatId: bigint | number, action: 'typing'): Promise<void> {
  await callTelegram('sendChatAction', { chat_id: chatId, action });
}

export async function getFile(
  fileId: string,
  opts: { deadline?: number } = {}
): Promise<{ file_path: string; file_size?: number }> {
  const file = await callTelegram<{ file_path?: string; file_size?: number }>(
    'getFile',
    { file_id: fileId },
    { deadline: opts.deadline }
  );
  // The API marks file_path optional; without it there is nothing to download.
  if (!file.file_path) throw new TelegramError('getFile', 'no file path', 200);
  return { file_path: file.file_path, file_size: file.file_size };
}

/**
 * The file URL embeds the token, so like every other call this reports only
 * a status. The body is read incrementally so that `maxBytes` bounds memory
 * even when `content-length` is missing or wrong.
 */
export async function downloadFile(
  filePath: string,
  opts: { deadline?: number; maxBytes?: number } = {}
): Promise<Buffer> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError('download', 'not configured', 0);

  const res = await fetch(`${API}/file/bot${token}/${filePath}`, {
    // A GET, so the one fetch a later fetchCache or 'use cache' would store,
    // keyed on a URL that holds the token.
    cache: 'no-store',
    signal: signalFor(10_000, opts.deadline),
  });
  const max = opts.maxBytes ?? Infinity;

  if (!res.ok) {
    await res.body?.cancel();
    throw new TelegramError('download', `HTTP ${res.status}`, res.status);
  }
  if (Number(res.headers.get('content-length')) > max) {
    await res.body?.cancel();
    throw new TelegramError('download', 'too large', 413);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > max) {
        await reader.cancel();
        throw new TelegramError('download', 'too large', 413);
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks, received);
}
