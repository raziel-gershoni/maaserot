import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import he from '../messages/he.json';
import type { Candidate, Reading } from '@/lib/depositParsing';
import {
  decodeCallback,
  renderNotice,
  renderPicker,
  renderReading,
  type BotNoticeKey,
  type Locale,
} from '@/lib/salaryCard';
import type { OutgoingMessage, TgUpdate } from '@/lib/telegramBot';
import {
  FIRST_SENT_ID,
  PNG,
  fixClock,
  line,
  pendingRow,
  photoUpdate,
  reading,
  setup,
  tapUpdate,
  u1,
  u2,
} from './salaryIntakeHarness';

/**
 * A screenshot, from the update Telegram sends to the card on the placeholder
 * (spec Flow 1 and Flow 2). Claude, Telegram and the database are all fakes;
 * see ./salaryIntakeHarness.
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const notice = (key: BotNoticeKey, locale: Locale = 'he') => renderNotice(locale, key).text;
const taps = (msg: OutgoingMessage) =>
  (msg.replyMarkup?.inline_keyboard.flat() ?? []).map((b) => decodeCallback(b.callback_data));
const webAppUrls = (msg: OutgoingMessage) =>
  (msg.replyMarkup?.inline_keyboard.flat() ?? []).flatMap((b) => (b.web_app ? [b.web_app.url] : []));

/** What the placeholder (the first message sent for a photo) shows now. */
function screen(tg: Awaited<ReturnType<typeof setup>>['tg'], placeholderId = FIRST_SENT_ID): OutgoingMessage {
  const edits = tg.edited.filter((e) => e.messageId === placeholderId);
  return edits.at(-1)!.msg;
}

/** The longest stretch of a message that no placeholder fills in. */
const fixedPart = (template: string) => template.split(/\{[^}]*\}/).sort((a, b) => b.length - a.length)[0];

const silenceErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  fixClock();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a screenshot with one deposit', () => {
  it('replies "Reading…", reads the largest photo once and edits the placeholder into a card', async () => {
    const { db, tg, reader, handleUpdate } = await setup();

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(reader).toHaveBeenCalledTimes(1);
    const [image, mediaType, deadline] = reader.mock.calls[0];
    expect(image[0]).toBe(0xff);
    expect(mediaType).toBe('image/jpeg');
    expect(typeof deadline).toBe('number');
    expect(tg.getFile).toHaveBeenCalledWith('photo-large', expect.anything());
    expect(tg.downloadFile).toHaveBeenCalledWith('p', expect.objectContaining({ maxBytes: 7_500_000 }));

    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0]).toMatchObject({ chatId: BigInt(111), replyTo: 10 });
    expect(tg.sent[0].msg.text).toBe(renderReading('he').text);
    expect(tg.sendChatAction.mock.invocationCallOrder[0]).toBeLessThan(tg.sendMessage.mock.invocationCallOrder[0]);

    const card = screen(tg);
    expect(card.text).toContain('12,345.67');

    expect(db.pendingIncomes).toHaveLength(1);
    const [row] = db.pendingIncomes;
    expect(row).toMatchObject({
      userId: 'u1',
      status: 'OPEN',
      version: 1,
      amount: 1234567,
      month: '2026-10',
      depositDate: '2026-10-10',
      dateFromImage: true,
      description: 'ACME Ltd',
      percentage: 10,
      viaImage: true,
      cardMessageId: FIRST_SENT_ID,
    });
    expect(row.candidates).toHaveLength(1);

    // Every button is bound to this row at its current version, and a lone
    // deposit has no "↩ Other deposit" to go back to.
    const decoded = taps(card);
    expect(decoded.length).toBeGreaterThan(0);
    for (const d of decoded) expect(d).toMatchObject({ id: row.id, version: 1 });
    expect(decoded.map((d) => d!.action)).toContain('a');
    expect(decoded.map((d) => d!.action)).not.toContain('l');
    expect(card.text).not.toContain(he.bot.card.warnDirection);
  });
});

describe('a screenshot with several deposits', () => {
  it('shows a picker with one button per deposit', async () => {
    const { db, tg, reader, handleUpdate } = await setup();
    reader.mockResolvedValueOnce({
      kind: 'ok',
      reading: reading([line(), line({ amountText: '+3,000', day: 11, description: 'Bonus' })]),
    });

    await handleUpdate(photoUpdate({ messageId: 10 }));

    const [row] = db.pendingIncomes;
    expect(row).toMatchObject({ status: 'OPEN', version: 1, amount: null, month: null });
    expect(row.candidates).toHaveLength(2);
    const picks = taps(screen(tg)).filter((d) => d?.action === 'p');
    expect(picks.map((d) => d!.arg)).toEqual(['0', '1']);
  });

  it('says when more than 8 were found, and only then', async () => {
    const lines = (n: number) =>
      Array.from({ length: n }, (_, i) => line({ amountText: `+${1000 + i}`, day: i + 1 }));

    for (const [count, truncated] of [[9, true], [8, false]] as const) {
      const { db, tg, reader, handleUpdate } = await setup();
      reader.mockResolvedValueOnce({ kind: 'ok', reading: reading(lines(count)) });

      await handleUpdate(photoUpdate({ messageId: 10 }));

      const [row] = db.pendingIncomes;
      const picker = screen(tg);
      expect(taps(picker).filter((d) => d?.action === 'p')).toHaveLength(8);
      expect(picker.text).toBe(
        renderPicker({
          locale: 'he',
          id: row.id,
          version: row.version,
          candidates: row.candidates as Candidate[],
          truncated,
        }).text
      );
    }
  });
});

describe('a screenshot with no deposit', () => {
  it.each<[string, Reading, BotNoticeKey]>([
    ['only outgoing lines', reading([line({ direction: 'out', amountText: '-500' })]), 'onlyOutgoing'],
    ['not a bank screen', { isBankScreen: false, transactions: [] }, 'notBankScreen'],
  ])('%s → CANCELLED and the matching notice with an Open app button', async (_, r, key) => {
    const { db, tg, reader, handleUpdate } = await setup();
    reader.mockResolvedValueOnce({ kind: 'ok', reading: r });

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(db.pendingIncomes[0].status).toBe('CANCELLED');
    const shown = screen(tg);
    expect(shown.text).toBe(notice(key));
    expect(webAppUrls(shown)).toHaveLength(1);
    expect(webAppUrls(shown)[0]).toMatch(/\/he\/income$/);
  });
});

describe('updates that must not be read twice', () => {
  it('a redelivered update leaves one row, one read, and no second reply', async () => {
    const { db, tg, reader, handleUpdate } = await setup();
    const update = photoUpdate({ messageId: 10 });
    await handleUpdate(update);
    const sent = tg.sent.length, edited = tg.edited.length;
    const errors = silenceErrors();

    await handleUpdate(update);

    expect(db.pendingIncomes).toHaveLength(1);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(tg.sent).toHaveLength(sent);
    expect(tg.edited).toHaveLength(edited);
    expect(tg.sendChatAction).toHaveBeenCalledTimes(1);
    // The claim returns null on a unique conflict; a throw would be logged.
    expect(errors).not.toHaveBeenCalled();
  });

  it('only the first photo of an album is read', async () => {
    const { db, tg, reader, handleUpdate } = await setup();
    await handleUpdate(photoUpdate({ messageId: 10, mediaGroupId: 'album-1' }));
    const sent = tg.sent.length, edited = tg.edited.length;
    const errors = silenceErrors();

    await handleUpdate(photoUpdate({ messageId: 11, mediaGroupId: 'album-1' }));

    expect(reader).toHaveBeenCalledTimes(1);
    expect(db.pendingIncomes).toHaveLength(1);
    expect(tg.sent).toHaveLength(sent);
    expect(tg.edited).toHaveLength(edited);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('the reading quota', () => {
  const recentRows = (n: number, patch: Parameters<typeof pendingRow>[0], spacingMs: number) =>
    Array.from({ length: n }, (_, i) =>
      pendingRow({ ...patch, createdAt: new Date(Date.now() - (i + 1) * spacingMs) })
    );

  it.each([
    ["10 of the user's own in the last hour", () => recentRows(10, { userId: 'u1' }, 60_000)],
    ['200 from other users in the last 24 h', () => recentRows(200, { userId: 'u9', chatId: BigInt(999) }, 5 * 60_000)],
  ])('%s → no read, the new row CANCELLED, and "too many"', async (_, rows) => {
    const { db, tg, reader, handleUpdate } = await setup({ pendingIncomes: rows() });

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(reader).not.toHaveBeenCalled();
    expect(tg.getFile).not.toHaveBeenCalled();
    expect(db.pendingIncomes.find((r) => r.sourceMessageId === 10)!.status).toBe('CANCELLED');
    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0]).toMatchObject({ replyTo: 10 });
    expect(tg.sent[0].msg.text).toBe(notice('tooMany'));
  });

  it('counts the new row too, so the 10th in an hour is still read', async () => {
    const { reader, handleUpdate } = await setup({ pendingIncomes: recentRows(9, { userId: 'u1' }, 60_000) });

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(reader).toHaveBeenCalledTimes(1);
  });
});

describe('a re-sent screenshot', () => {
  it('the same reading again within 10 minutes says "Already got this one"', async () => {
    const { db, tg, handleUpdate } = await setup();

    await handleUpdate(photoUpdate({ messageId: 10 }));
    await handleUpdate(photoUpdate({ messageId: 11 }));

    expect(screen(tg, FIRST_SENT_ID + 1).text).toBe(notice('alreadyGot'));
    expect(db.pendingIncomes.filter((r) => r.status === 'OPEN')).toHaveLength(1);
    expect(db.pendingIncomes.find((r) => r.sourceMessageId === 11)!.status).toBe('CANCELLED');
  });

  it('says "Already added" when the first one was approved, whose candidates were cleared', async () => {
    const { db, tg, handleUpdate } = await setup();
    await handleUpdate(photoUpdate({ messageId: 10 }));
    Object.assign(db.pendingIncomes[0], { status: 'APPROVED', candidates: [] });

    await handleUpdate(photoUpdate({ messageId: 11 }));

    expect(screen(tg, FIRST_SENT_ID + 1).text).toBe(notice('alreadyAdded'));
  });

  it('is a new card once 10 minutes have passed', async () => {
    const { db, handleUpdate } = await setup();
    await handleUpdate(photoUpdate({ messageId: 10 }));
    vi.setSystemTime(Date.now() + 11 * 60_000);

    await handleUpdate(photoUpdate({ messageId: 11 }));

    expect(db.pendingIncomes.filter((r) => r.status === 'OPEN')).toHaveLength(2);
  });
});

describe('reads that fail', () => {
  it.each([
    ['error', 'readError'],
    ['tooLong', 'tooLong'],
    ['unreadable', 'unreadable'],
    ['notConfigured', 'notConfigured'],
  ] as const)('%s → the %s notice and a CANCELLED row', async (kind, key) => {
    const { db, tg, reader, handleUpdate } = await setup();
    reader.mockResolvedValueOnce({ kind });

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(screen(tg).text).toBe(notice(key));
    expect(db.pendingIncomes[0].status).toBe('CANCELLED');
  });

  it('a reader that throws → readError and a CANCELLED row', async () => {
    const { db, tg, reader, handleUpdate } = await setup();
    reader.mockRejectedValueOnce(new Error('boom'));
    silenceErrors();

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(screen(tg).text).toBe(notice('readError'));
    expect(db.pendingIncomes[0].status).toBe('CANCELLED');
  });

  it('a card that cannot be shown leaves its row CANCELLED, not OPEN and invisible', async () => {
    const { db, tg, handleUpdate } = await setup();
    tg.editMessageText.mockRejectedValueOnce(new Error('edit failed'));
    silenceErrors();

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(db.pendingIncomes[0]).toMatchObject({ status: 'CANCELLED', candidates: [] });
    expect(screen(tg).text).toBe(notice('readError'));
  });

  it('a placeholder that cannot be sent → the error goes out as a new message', async () => {
    const { db, tg, reader, handleUpdate } = await setup();
    tg.sendMessage.mockRejectedValueOnce(new Error('send failed'));
    const errors = silenceErrors();

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(reader).not.toHaveBeenCalled();
    expect(db.pendingIncomes[0].status).toBe('CANCELLED');
    expect(tg.edited).toHaveLength(0);
    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0]).toMatchObject({ replyTo: 10 });
    expect(tg.sent[0].msg.text).toBe(notice('readError'));
    expect(errors).toHaveBeenCalledTimes(1);
  });

  // The deadline leaves 10 s of maxDuration for exactly this reply; held to
  // the deadline that just passed, it would abort and say nothing.
  it('a read that ran past the deadline still ends with the error on the placeholder', async () => {
    const { db, tg, handleUpdate } = await setup();
    tg.downloadFile.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 55_000);
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    silenceErrors();

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(db.pendingIncomes[0].status).toBe('CANCELLED');
    expect(screen(tg).text).toBe(notice('readError'));
  });

  it('an image over 7.5 MB → "too large", with no download and no read', async () => {
    const { db, tg, reader, handleUpdate } = await setup();
    tg.getFile.mockResolvedValueOnce({ file_path: 'p', file_size: 8_000_000 });

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(screen(tg).text).toBe(notice('tooLarge'));
    expect(tg.downloadFile).not.toHaveBeenCalled();
    expect(reader).not.toHaveBeenCalled();
    expect(db.pendingIncomes[0].status).toBe('CANCELLED');
  });

  it('bytes that are not the image they claim to be → unreadable, with no read', async () => {
    const { db, tg, reader, handleUpdate } = await setup();
    tg.downloadFile.mockResolvedValueOnce(Buffer.from('<html>not an image</html>'));

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(screen(tg).text).toBe(notice('unreadable'));
    expect(reader).not.toHaveBeenCalled();
    expect(db.pendingIncomes[0].status).toBe('CANCELLED');
  });

  // A fetch-level failure is not a TelegramError. Its message can quote the
  // file URL, which holds the bot token, so only its name and code are logged.
  it('a download that fails below Telegram is logged by name and code only', async () => {
    const { db, tg, reader, handleUpdate } = await setup();
    const errors = silenceErrors();
    const failures = [
      { err: new DOMException('x', 'TimeoutError'), name: 'TimeoutError', code: 23 },
      {
        err: new TypeError('Failed to parse URL from https://api.telegram.org/file/bot123:SECRET/p'),
        name: 'TypeError',
        code: undefined,
      },
    ];

    for (const [i, { err, name, code }] of failures.entries()) {
      errors.mockClear();
      tg.downloadFile.mockRejectedValueOnce(err);
      const update = photoUpdate({ messageId: 10 + i });

      await handleUpdate(update);

      const row = db.pendingIncomes.find((r) => r.sourceMessageId === 10 + i)!;
      expect(row.status).toBe('CANCELLED');
      expect(screen(tg, row.cardMessageId!).text).toBe(notice('readError'));
      expect(reader).not.toHaveBeenCalled();
      expect(errors).toHaveBeenCalledTimes(1);
      expect(errors.mock.calls[0]).toStrictEqual(['[salaryIntake:image]', name, code, update.update_id, row.id]);
      for (const arg of errors.mock.calls.flat()) {
        expect(['string', 'number', 'undefined']).toContain(typeof arg);
      }
      const logged = JSON.stringify(errors.mock.calls);
      expect(logged).not.toContain('SECRET');
      expect(logged).not.toContain('api.telegram.org');
    }
  });
});

describe('files sent as documents', () => {
  const documentUpdate = (document: { file_id: string; mime_type?: string; file_size?: number }): TgUpdate => {
    const update = photoUpdate({ messageId: 10 });
    delete update.message!.photo;
    update.message!.document = document;
    return update;
  };

  it('a PNG file is read as a PNG', async () => {
    const { tg, reader, handleUpdate } = await setup();
    tg.downloadFile.mockResolvedValueOnce(PNG);

    await handleUpdate(documentUpdate({ file_id: 'doc-1', mime_type: 'image/png', file_size: 50_000 }));

    expect(tg.getFile).toHaveBeenCalledWith('doc-1', expect.anything());
    expect(reader.mock.calls[0][1]).toBe('image/png');
  });

  it('a file Telegram already says is over 7.5 MB → "too large" without asking for it', async () => {
    const { db, tg, handleUpdate } = await setup();

    await handleUpdate(documentUpdate({ file_id: 'doc-1', mime_type: 'image/jpeg', file_size: 25_000_000 }));

    expect(tg.getFile).not.toHaveBeenCalled();
    expect(screen(tg).text).toBe(notice('tooLarge'));
    expect(db.pendingIncomes[0].status).toBe('CANCELLED');
  });

  it('any other file gets "send a screenshot", and no row', async () => {
    const { db, tg, handleUpdate } = await setup();

    await handleUpdate(documentUpdate({ file_id: 'doc-1', mime_type: 'application/pdf' }));

    expect(db.pendingIncomes).toHaveLength(0);
    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0].msg.text).toBe(notice('unsupportedFile'));
  });
});

describe('who and where', () => {
  it('an unknown sender gets the /tg message in their language, and no row', async () => {
    const { db, tg, reader, handleUpdate } = await setup();

    await handleUpdate(photoUpdate({ messageId: 10, fromId: 999 }));
    await handleUpdate(photoUpdate({ messageId: 11, fromId: 999, languageCode: 'en-US' }));

    expect(db.pendingIncomes).toHaveLength(0);
    expect(reader).not.toHaveBeenCalled();
    expect(tg.sent.map((s) => s.msg.text)).toEqual([notice('unknownSender'), notice('unknownSender', 'en')]);
    for (const { msg } of tg.sent) {
      expect(webAppUrls(msg)).toHaveLength(1);
      expect(webAppUrls(msg)[0]).toMatch(/\/tg$/);
    }
  });

  // Ruling R1: the spec's Flow 1 answers an unknown sender's tap "with the same text".
  it("an unknown sender's tap is answered once with that message, which then follows with the button", async () => {
    const { tg, handleUpdate } = await setup();

    await handleUpdate(tapUpdate({ data: `si:a:c${'1'.repeat(24)}:1`, messageId: 500, fromId: 999 }));

    expect(tg.answered).toHaveLength(1);
    expect(tg.answered[0].text).toBe(notice('unknownSender'));
    expect(tg.sent).toHaveLength(1);
    expect(webAppUrls(tg.sent[0].msg)[0]).toMatch(/\/tg$/);
  });

  it('a group chat is ignored', async () => {
    const { db, tg, reader, handleUpdate } = await setup();
    const update = photoUpdate({ messageId: 10 });
    update.message!.chat = { id: -100123, type: 'group' };

    await handleUpdate(update);

    expect(tg.sent).toHaveLength(0);
    expect(db.pendingIncomes).toHaveLength(0);
    expect(reader).not.toHaveBeenCalled();
  });
});

describe('housekeeping', () => {
  it("deletes the sender's rows that expired over 7 days ago, and keeps the rest", async () => {
    const expiredAgo = (ms: number, userId = 'u1') =>
      pendingRow({ userId, viaImage: false, createdAt: new Date(Date.now() - ms - 2 * DAY), expiresAt: new Date(Date.now() - ms) });
    const stale = expiredAgo(8 * DAY);
    const recent = expiredAgo(2 * DAY);
    const partners = expiredAgo(8 * DAY, 'u2');
    const { db, handleUpdate } = await setup({ pendingIncomes: [stale, recent, partners] });

    await handleUpdate(photoUpdate({ messageId: 10 }));

    const ids = db.pendingIncomes.map((r) => r.id);
    expect(ids).not.toContain(stale.id);
    expect(ids).toContain(recent.id);
    expect(ids).toContain(partners.id);
  });
});

describe('dates', () => {
  it("files by the time the photo was sent, not when the update arrived", async () => {
    const { db, reader, handleUpdate } = await setup();
    reader.mockResolvedValueOnce({
      kind: 'ok',
      reading: reading([line({ day: null, month: null, year: null, relativeDay: 'today' })]),
    });
    const sentAt = Math.floor(Date.parse('2026-09-30T08:00:00Z') / 1000);

    await handleUpdate(photoUpdate({ messageId: 10, date: sentAt }));

    expect(db.pendingIncomes[0]).toMatchObject({ depositDate: '2026-09-30', month: '2026-09' });
  });

  it("offers the Israeli current month as a card's later month, even while UTC is still in the last one", async () => {
    fixClock('2026-09-30T22:30:00Z'); // 01:30 on 1 October in Israel
    const { db, tg, reader, handleUpdate } = await setup();
    reader.mockResolvedValueOnce({ kind: 'ok', reading: reading([line({ day: 30, month: 9 })]) });

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(db.pendingIncomes[0].month).toBe('2026-09');
    const months = taps(screen(tg)).filter((d) => d?.action === 'm').map((d) => d!.arg!);
    expect(months).toContain('2026-10');
    expect(months.filter((m) => m > '2026-10')).toEqual([]);
    // One month from the current one: the later button is all it needs, no jump.
    expect(months.filter((m) => m === '2026-10')).toHaveLength(1);
  });
});

describe('the card', () => {
  it('stores the default description when the line has none, in the sender\'s language', async () => {
    for (const [locale, expected] of [['he', 'משכורת'], ['en', 'Salary']] as const) {
      const { db, reader, handleUpdate } = await setup({ users: [{ ...u1, locale }, { ...u2 }] });
      reader.mockResolvedValueOnce({ kind: 'ok', reading: reading([line({ description: '   ' })]) });

      await handleUpdate(photoUpdate({ messageId: 10 }));

      expect(db.pendingIncomes[0].description).toBe(expected);
    }
  });

  it('warns of another open card for the same amount and month, and of a month already paid', async () => {
    // Typed, so it is not mistaken for the same screenshot sent again.
    const other = pendingRow({
      status: 'OPEN', viaImage: false, amount: 1234567, month: '2026-10', depositDate: '2026-10-12', percentage: 10,
    });
    const payment = {
      id: 'snap-1', month: '2026-10', groupOwnerId: 'u2', totalGroupMaaser: 0, totalGroupFixedCharities: 0,
      groupAmountPaid: 100, memberStates: [], paidAt: new Date(), members: [{ userId: 'u1' }, { userId: 'u2' }],
    };
    const { tg, handleUpdate } = await setup({ pendingIncomes: [other], snapshots: [payment] });

    await handleUpdate(photoUpdate({ messageId: 10 }));

    const text = screen(tg).text;
    expect(text).toContain(fixedPart(he.bot.card.warnOtherOpen));
    expect(text).toContain(fixedPart(he.bot.card.warnPaid));
  });

  it('warns of neither when nothing else is open and nothing was paid', async () => {
    const { tg, handleUpdate } = await setup();

    await handleUpdate(photoUpdate({ messageId: 10 }));

    const text = screen(tg).text;
    expect(text).not.toContain(fixedPart(he.bot.card.warnOtherOpen));
    expect(text).not.toContain(fixedPart(he.bot.card.warnPaid));
  });

  it('warns when the model could not tell the line was incoming', async () => {
    const { tg, reader, handleUpdate } = await setup();
    reader.mockResolvedValueOnce({
      kind: 'ok',
      reading: reading([line({ direction: 'unknown', amountText: '12,345.67' })]),
    });

    await handleUpdate(photoUpdate({ messageId: 10 }));

    expect(screen(tg).text).toContain(he.bot.card.warnDirection);
  });
});
