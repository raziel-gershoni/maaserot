import { readDeposits, type ImageMediaType, type ReadResult } from '../depositReader';
import { toCandidates } from '../depositParsing';
import { defaultDescription, renderNotice, renderReading, type BotNoticeKey } from '../salaryCard';
import {
  downloadFile,
  editMessageText,
  getFile,
  sendChatAction,
  sendMessage,
  type OutgoingMessage,
  type TgMessage,
} from '../telegramBot';
import { appUrl, logError, type Ctx } from './context';
import { showRow } from './render';
import {
  cancelOpen,
  claimImageRow,
  deleteStaleRows,
  findResent,
  finishReading,
  getRow,
  quotaExceeded,
  refuseForQuota,
  setCardMessage,
} from './rows';

/**
 * A screenshot to a card (spec Flow 2).
 *
 * The row is claimed before anything is spent, so a redelivered update or a
 * second photo of an album costs nothing. From then on every path ends with
 * the row out of READING and the placeholder saying why: a card, a picker or
 * a notice. That holds for a read that throws or runs out of time too: a user
 * left looking at "Reading…" has no way to know it gave up.
 */

/** Claude takes at most 10 MB of base64, which is about this much raw. */
const MAX_IMAGE_BYTES = 7_500_000;

const DOCUMENT_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp']);

const READ_FAILURES = {
  error: 'readError',
  tooLong: 'tooLong',
  unreadable: 'unreadable',
  notConfigured: 'notConfigured',
} as const satisfies Record<Exclude<ReadResult['kind'], 'ok'>, BotNoticeKey>;

interface ImageFile { fileId: string; mediaType: ImageMediaType; size?: number }

/** The file to read from a message, or null when it holds no image we accept. */
export function imageFileOf(message: TgMessage): ImageFile | null {
  if (message.photo?.length) {
    // Telegram sends one photo in several sizes; the largest has the most legible digits.
    const largest = message.photo.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    // Telegram re-encodes every photo as JPEG.
    return { fileId: largest.file_id, mediaType: 'image/jpeg', size: largest.file_size };
  }
  const doc = message.document;
  if (doc && DOCUMENT_TYPES.has(doc.mime_type ?? '')) {
    return { fileId: doc.file_id, mediaType: doc.mime_type as ImageMediaType, size: doc.file_size };
  }
  return null;
}

/** The type the bytes actually are. A file's name and mime type are only the sender's claim. */
function sniff(b: Buffer): ImageMediaType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export async function handleImage(ctx: Ctx, message: TgMessage): Promise<void> {
  const file = imageFileOf(message);
  if (!file) return;
  const { sender, chatId, deadline } = ctx;
  const { locale } = sender;
  const now = ctx.now();

  const row = await claimImageRow({
    userId: sender.id,
    chatId,
    sourceMessageId: message.message_id,
    mediaGroupId: message.media_group_id ?? null,
    now,
  });
  if (!row) return;
  const ids = { updateId: ctx.updateId, pendingId: row.id };

  let placeholder: number | null = null;
  // The version this handler opened the row at; see the catch below.
  let openedAt: number | null = null;

  // Once the placeholder is out, every outcome replaces it, so the user
  // watches one message turn into the answer.
  const say = async (msg: OutgoingMessage, by: { deadline?: number } = { deadline }) => {
    if (placeholder === null) await sendMessage(chatId, msg, { replyTo: message.message_id, ...by });
    else await editMessageText(chatId, placeholder, msg, by);
  };
  const cancelWith = async (msg: OutgoingMessage) => {
    await finishReading(row.id, { status: 'CANCELLED' });
    await say(msg);
  };
  const notice = (key: BotNoticeKey) => renderNotice(locale, key);

  try {
    await deleteStaleRows(sender.id, now);
    if (await quotaExceeded(sender.id, now)) {
      // Not cancelWith: a refused row must also stop counting toward the quota.
      await refuseForQuota(row.id);
      return await say(notice('tooMany'));
    }

    try {
      await sendChatAction(chatId, 'typing');
    } catch {
      // Only a nicety; the placeholder says the same thing.
    }
    placeholder = (await sendMessage(chatId, renderReading(locale), { replyTo: message.message_id, deadline })).message_id;
    // A reply to the placeholder then finds this row, and hears it is still being read.
    await setCardMessage(row.id, placeholder, ['READING']);

    // Telegram states the size up front. A file over getFile's 20 MB limit
    // would otherwise fail there, and read as "try again" rather than "too large".
    if ((file.size ?? 0) > MAX_IMAGE_BYTES) return await cancelWith(notice('tooLarge'));
    const info = await getFile(file.fileId, { deadline });
    if ((info.file_size ?? 0) > MAX_IMAGE_BYTES) return await cancelWith(notice('tooLarge'));
    const image = await downloadFile(info.file_path, { deadline, maxBytes: MAX_IMAGE_BYTES });
    if (sniff(image) !== file.mediaType) return await cancelWith(notice('unreadable'));

    const result = await readDeposits(image, file.mediaType, deadline);
    if (result.kind !== 'ok') return await cancelWith(notice(READ_FAILURES[result.kind]));

    // Dated by when the photo was sent (Unix seconds), not when it arrived:
    // Telegram can deliver late, and "today" on the screen means the day it was taken.
    const { candidates, truncated } = toCandidates(result.reading, new Date(message.date * 1000));
    if (candidates.length === 0) {
      const key = result.reading.isBankScreen ? 'onlyOutgoing' : 'notBankScreen';
      return await cancelWith(renderNotice(locale, key, undefined, { kind: 'app', url: `${appUrl()}/${locale}/income` }));
    }

    const resent = await findResent(sender.id, row.id, candidates, now);
    if (resent) return await cancelWith(notice(resent.status === 'APPROVED' ? 'alreadyAdded' : 'alreadyGot'));

    const [only] = candidates;
    const opened = await finishReading(
      row.id,
      candidates.length === 1
        ? {
            status: 'OPEN',
            candidates,
            amount: only.amount,
            month: only.month,
            depositDate: only.date,
            dateFromImage: only.dateFromImage,
            description: only.description || defaultDescription(locale),
            // Captured now and shown on the card; approve records exactly this.
            percentage: sender.defaultPercent,
          }
        : { status: 'OPEN', candidates }
    );
    if (opened === 1) openedAt = row.version + 1;

    const fresh = await getRow(row.id);
    if (fresh) await showRow(ctx, placeholder, fresh, { truncated });
  } catch (err) {
    logError('image', err, ids);
    // The rest is best effort: whatever failed may fail again.
    try {
      const cancelled = await finishReading(row.id, { status: 'CANCELLED' });
      // The row was opened but its card never reached the user. Left OPEN, it
      // would be a card no one can see that a typed amount could still land on.
      if (cancelled === 0 && openedAt !== null) await cancelOpen(row.id, sender.id, openedAt, ctx.now());
    } catch (e) {
      logError('image', e, ids);
    }
    try {
      // Not held to the deadline, which may be what just ran out: the time
      // between it and maxDuration is kept for this reply.
      await say(notice('readError'), {});
    } catch (e) {
      logError('image', e, ids);
    }
  }
}
