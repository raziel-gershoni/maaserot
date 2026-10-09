import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Sdk from '@anthropic-ai/sdk';
import type { RawTransaction, Reading } from '@/lib/depositParsing';
import type { ReadResult } from '@/lib/depositReader';

/**
 * The Claude call, with the SDK's client replaced by a fake whose
 * `messages.create` is a mock. The SDK's own error classes stay real, since
 * the reader tells a bad image from an outage, and names the error it logs, by
 * class. Nothing here reaches the network, and the key is a fake.
 */

const create = vi.fn();
const constructed = vi.fn();
let actual: typeof Sdk;

async function load() {
  actual = await vi.importActual<typeof Sdk>('@anthropic-ai/sdk');
  vi.doMock('@anthropic-ai/sdk', () => ({
    ...actual,
    default: class FakeAnthropic {
      messages = { create };
      constructor(opts: unknown) {
        constructed(opts);
      }
    },
  }));
  return import('@/lib/depositReader');
}

const IMAGE = Buffer.from('not really a png');
const inAMinute = () => Date.now() + 60_000;

const line = (over: Partial<RawTransaction> = {}): RawTransaction => ({
  amountText: '+12,345.67 ₪',
  direction: 'in',
  currency: 'ILS',
  day: 5,
  month: 9,
  year: null,
  relativeDay: null,
  description: 'משכורת',
  ...over,
});

const READING: Reading = {
  isBankScreen: true,
  transactions: [
    line(),
    line({ amountText: '-250.00', direction: 'out', day: null, month: null, relativeDay: 'yesterday', description: 'סופר' }),
  ],
};

function answer(stop_reason: string, text?: string) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason,
    content: [
      // Thinking comes first on this model even when its text is omitted, so
      // the reader must find the text block by type, not take content[0].
      { type: 'thinking', thinking: '', signature: 'sig' },
      ...(text === undefined ? [] : [{ type: 'text', text }]),
    ],
  };
}

function badRequest() {
  return new actual.BadRequestError(
    400,
    { type: 'error', error: { type: 'invalid_request_error', message: 'Could not process image' } },
    'Could not process image',
    new Headers()
  );
}

/**
 * The same error as a production build ships it. Next minifies the bundled
 * SDK, so `BadRequestError` runs as a class named `t`: the class chain is
 * intact, and only `constructor.name` changes.
 */
function minified<T extends Error>(err: T): T {
  const t = class extends (err.constructor as new (...args: never[]) => Error) {};
  return Object.setPrototypeOf(err, t.prototype);
}

let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // tests/setup.ts removed the real key; leave it removed.
  delete process.env.ANTHROPIC_API_KEY;
  vi.restoreAllMocks();
});

describe('readDeposits', () => {
  it('returns the reading from the first text block, after a thinking block', async () => {
    const { readDeposits } = await load();
    create.mockResolvedValue(answer('end_turn', JSON.stringify(READING)));

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind: 'ok', reading: READING });
  });

  it('is unreadable when the JSON is missing a field', async () => {
    const { readDeposits } = await load();
    const withoutDirection: Partial<RawTransaction> = line();
    delete withoutDirection.direction;
    create.mockResolvedValue(
      answer('end_turn', JSON.stringify({ isBankScreen: true, transactions: [withoutDirection] }))
    );

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind: 'unreadable' });
  });

  it('is unreadable when the text is not JSON at all', async () => {
    const { readDeposits } = await load();
    create.mockResolvedValue(answer('end_turn', 'I see a bank screen with one deposit.'));

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind: 'unreadable' });
  });

  it('is unreadable when the turn ends with no text block', async () => {
    const { readDeposits } = await load();
    create.mockResolvedValue(answer('end_turn'));

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind: 'unreadable' });
  });

  it('keeps the first 25 lines of a longer reading', async () => {
    const { readDeposits } = await load();
    const lines = Array.from({ length: 30 }, (_, i) => line({ day: i + 1 }));
    create.mockResolvedValue(answer('end_turn', JSON.stringify({ isBankScreen: true, transactions: lines })));

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({
      kind: 'ok',
      reading: { isBankScreen: true, transactions: lines.slice(0, 25) },
    });
  });

  it('is tooLong when the output hit max_tokens', async () => {
    const { readDeposits } = await load();
    create.mockResolvedValue(answer('max_tokens', '{"isBankScreen": true, "transactions": [{"amou'));

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind: 'tooLong' });
  });

  it('is unreadable on a refusal, even with text', async () => {
    const { readDeposits } = await load();
    create.mockResolvedValue(answer('refusal', JSON.stringify(READING)));

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind: 'unreadable' });
  });

  it('is an error when the connection times out, and logs only the class', async () => {
    const { readDeposits } = await load();
    create.mockRejectedValue(new actual.APIConnectionTimeoutError());

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind: 'error' });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('[depositReader]', 'APIConnectionTimeoutError', undefined);
  });

  it('is an error when the deadline aborts the request', async () => {
    const { readDeposits } = await load();
    create.mockRejectedValue(new actual.APIUserAbortError());

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind: 'error' });
  });

  it('is unreadable when the API rejects the image with a 400, and logs only class and status', async () => {
    const { readDeposits } = await load();
    create.mockRejectedValue(badRequest());

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind: 'unreadable' });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('[depositReader]', 'BadRequestError', 400);
  });

  it.each<[string, () => unknown, ReadResult['kind'], string, number | undefined]>([
    ['a 400', () => minified(badRequest()), 'unreadable', 'BadRequestError', 400],
    [
      'a 429',
      () => minified(new actual.RateLimitError(429, undefined, 'Rate limited', new Headers())),
      'error',
      'APIError',
      429,
    ],
    [
      'a 529',
      () => minified(new actual.InternalServerError(529, undefined, 'Overloaded', new Headers())),
      'error',
      'APIError',
      529,
    ],
    ['a connection timeout', () => minified(new actual.APIConnectionTimeoutError()), 'error', 'APIConnectionTimeoutError', undefined],
    ['the deadline\'s abort', () => minified(new actual.APIUserAbortError()), 'error', 'APIUserAbortError', undefined],
    [
      'a lost connection',
      () => minified(new actual.APIConnectionError({ message: 'socket hang up' })),
      'error',
      'APIConnectionError',
      undefined,
    ],
    ['a native timeout', () => new DOMException('The operation timed out.', 'TimeoutError'), 'error', 'TimeoutError', undefined],
    ['a TypeError', () => new TypeError('fetch failed'), 'error', 'TypeError', undefined],
  ])('names %s in the log even when the bundle has minified its class', async (_name, thrown, kind, logged, status) => {
    const { readDeposits } = await load();
    create.mockRejectedValue(thrown());

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('[depositReader]', logged, status);
  });

  it('is notConfigured without an API key, and never calls Claude', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { readDeposits } = await load();

    expect(await readDeposits(IMAGE, 'image/png', inAMinute())).toEqual({ kind: 'notConfigured' });
    expect(constructed).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('is an error without calling Claude when the deadline leaves under 10 s', async () => {
    const { readDeposits } = await load();

    // 15 s left, minus the 8 s kept for the reply, is 7 s of budget.
    expect(await readDeposits(IMAGE, 'image/png', Date.now() + 15_000)).toEqual({ kind: 'error' });
    expect(create).not.toHaveBeenCalled();
  });

  it('sends the image to claude-opus-5-5 at low effort, with one retry and a deadline signal', async () => {
    const { readDeposits, DEPOSIT_MODEL } = await load();
    create.mockResolvedValue(answer('end_turn', JSON.stringify(READING)));

    await readDeposits(IMAGE, 'image/webp', inAMinute());

    expect(DEPOSIT_MODEL).toBe('claude-opus-5-5');
    expect(constructed).toHaveBeenCalledWith({ apiKey: 'test-key' });
    const [body, options] = create.mock.lastCall!;
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 8192,
      output_config: { effort: 'low', format: { type: 'json_schema' } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: IMAGE.toString('base64') } },
            { type: 'text', text: 'Transcribe this screen.' },
          ],
        },
      ],
    });
    expect(body.thinking).toBeUndefined();
    expect(typeof body.system).toBe('string');
    expect(options).toMatchObject({ timeout: 20_000, maxRetries: 1 });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  it('sends a schema the structured-output API accepts', async () => {
    const { readDeposits } = await load();
    create.mockResolvedValue(answer('end_turn', JSON.stringify(READING)));

    await readDeposits(IMAGE, 'image/png', inAMinute());

    // The API rejects an object schema that is open or leaves a property
    // optional, and the length and range keywords outright.
    const unsupported = ['maxItems', 'minItems', 'minimum', 'maximum', 'maxLength', 'minLength'];
    const visit = (node: Record<string, unknown>) => {
      for (const key of unsupported) expect(node).not.toHaveProperty(key);
      if (node.type === 'object') {
        expect(node.additionalProperties).toBe(false);
        expect([...(node.required as string[])].sort()).toEqual(Object.keys(node.properties as object).sort());
        for (const child of Object.values(node.properties as Record<string, Record<string, unknown>>)) visit(child);
      }
      if (node.items) visit(node.items as Record<string, unknown>);
    };
    const schema = create.mock.lastCall![0].output_config.format.schema;
    visit(schema);
    expect(Object.keys(schema.properties.transactions.items.properties).sort()).toEqual(
      Object.keys(line()).sort()
    );
  });
});

describe('isReading', () => {
  it('accepts a well-formed reading, an empty one and a long one', async () => {
    const { isReading } = await load();

    expect(isReading(READING)).toBe(true);
    expect(isReading({ isBankScreen: false, transactions: [] })).toBe(true);
    expect(isReading({ isBankScreen: true, transactions: Array.from({ length: 40 }, () => line()) })).toBe(true);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['an array', [READING]],
    ['isBankScreen as a string', { ...READING, isBankScreen: 'true' }],
    ['transactions missing', { isBankScreen: true }],
    ['a null line', { isBankScreen: true, transactions: [null] }],
    ['an unknown direction', { isBankScreen: true, transactions: [line({ direction: 'credit' as never })] }],
    ['an unknown currency', { isBankScreen: true, transactions: [line({ currency: 'USD' as never })] }],
    ['a fractional day', { isBankScreen: true, transactions: [line({ day: 5.5 })] }],
    ['a month as a string', { isBankScreen: true, transactions: [line({ month: '9' as never })] }],
    ['a missing year', { isBankScreen: true, transactions: [{ ...line(), year: undefined }] }],
    ['an unknown relativeDay', { isBankScreen: true, transactions: [line({ relativeDay: 'tomorrow' as never })] }],
    ['a numeric amountText', { isBankScreen: true, transactions: [line({ amountText: 100 as never })] }],
    ['a null description', { isBankScreen: true, transactions: [line({ description: null as never })] }],
  ])('rejects %s', async (_name, value) => {
    const { isReading } = await load();

    expect(isReading(value)).toBe(false);
  });
});
