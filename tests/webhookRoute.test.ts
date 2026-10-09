import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The webhook route, which is transport only. Next's real `after()` throws
 * outside a request scope, so it is stubbed with one that queues the work
 * where the test can await it, and the intake itself is mocked: what is
 * tested here is who gets in and that the work is handed on, not the work.
 */

const SECRET = 'test-webhook-secret';
const WEBHOOK_URL = 'https://app.test/api/telegram/webhook';
const UPDATE = { update_id: 7, message: { message_id: 1, date: 0, chat: { id: 111, type: 'private' } } };

const handleUpdate = vi.fn();
let pending: Promise<unknown>[];
let error: ReturnType<typeof vi.spyOn>;

async function load() {
  vi.doMock('next/server', async () => ({
    ...(await vi.importActual<typeof import('next/server')>('next/server')),
    after: (fn: () => unknown) => {
      pending.push(Promise.resolve().then(fn));
    },
  }));
  vi.doMock('@/lib/salaryIntake', () => ({ handleUpdate }));
  return import('@/app/api/telegram/webhook/route');
}

function post(body: string, secret?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== undefined) headers['x-telegram-bot-api-secret-token'] = secret;
  return new Request(WEBHOOK_URL, { method: 'POST', headers, body });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  pending = [];
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('POST /api/telegram/webhook', () => {
  it('turns away a request with no secret header', async () => {
    const { POST } = await load();

    const res = await POST(post(JSON.stringify(UPDATE)));
    await Promise.all(pending);

    expect(res.status).toBe(401);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('turns away a wrong secret, whether or not its length matches', async () => {
    const { POST } = await load();

    const sameLength = await POST(post(JSON.stringify(UPDATE), 'x'.repeat(SECRET.length)));
    const otherLength = await POST(post(JSON.stringify(UPDATE), `${SECRET}x`));
    await Promise.all(pending);

    expect(sameLength.status).toBe(401);
    expect(otherLength.status).toBe(401);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('fails closed when the secret is unset, even for a request that sends one', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const { POST } = await load();

    const res = await POST(post(JSON.stringify(UPDATE), SECRET));
    await Promise.all(pending);

    expect(res.status).toBe(401);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('answers 200 and hands the update on with a deadline 50 s after it arrived', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T08:00:00Z'));
    const { POST } = await load();

    const res = await POST(post(JSON.stringify(UPDATE), SECRET));
    await Promise.all(pending);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(handleUpdate).toHaveBeenCalledTimes(1);
    expect(handleUpdate).toHaveBeenCalledWith(UPDATE, Date.parse('2026-10-12T08:00:00Z') + 50_000);
  });

  it('answers before the work is done, so a slow read never makes Telegram retry', async () => {
    handleUpdate.mockReturnValue(new Promise(() => {}));
    const { POST } = await load();

    const res = await POST(post(JSON.stringify(UPDATE), SECRET));

    expect(res.status).toBe(200);
    expect(pending).toHaveLength(1);
  });

  it('answers 200 to a malformed body, since a retry cannot help, and hands nothing on', async () => {
    const { POST } = await load();

    const res = await POST(post('{not json', SECRET));
    await Promise.all(pending);

    expect(res.status).toBe(200);
    expect(handleUpdate).not.toHaveBeenCalled();
    // Logged, but never quoted: a body can hold whatever was typed.
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain('not json');
  });
});
