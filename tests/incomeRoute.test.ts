import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma, type FakeDb } from './fakePrisma';

/**
 * POST /api/income, the web form's add. The session is mocked, the rows live
 * in the in-memory fake, and `after()` is stubbed, since Next's throws outside
 * a request. What is tested is what the form hears and what reaches the log.
 */

const auth = vi.fn();
let db: FakeDb;
let client: ReturnType<typeof createFakePrisma>['client'];
let error: ReturnType<typeof vi.spyOn>;

async function load() {
  const fake = createFakePrisma({ users: [{ id: 'u1', name: 'Dana', telegramId: null, locale: 'he', defaultPercent: 10 }] });
  db = fake.db;
  client = fake.client;
  vi.doMock('@/lib/auth', () => ({ auth }));
  vi.doMock('@/lib/prisma', () => ({ prisma: fake.client }));
  vi.doMock('next/server', async () => ({
    ...(await vi.importActual<typeof import('next/server')>('next/server')),
    after: () => {},
  }));
  return import('@/app/api/income/route');
}

const post = (body: unknown) =>
  new Request('https://app.test/api/income', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: 'u1' } });
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/income', () => {
  it('an amount the column cannot hold is VALIDATION_FAILED, not a server error', async () => {
    const { POST } = await load();

    const res = await POST(post({ amount: 2_147_483_648, percentage: 10, description: 'bonus' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'VALIDATION_FAILED' });
    expect(db.incomes).toHaveLength(0);
    expect(error).not.toHaveBeenCalled();
  });

  it('a database failure is SERVER_ERROR, logged by name and code only', async () => {
    const { POST } = await load();
    vi.spyOn(client.income, 'create').mockRejectedValueOnce(
      Object.assign(new Error('Invalid `prisma.income.create()` invocation: { amount: 1250000, description: "Secret Corp" }'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2000',
      })
    );

    const res = await POST(post({ amount: 1250000, percentage: 10, description: 'Secret Corp' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'SERVER_ERROR' });
    expect(error.mock.calls).toEqual([['Error creating income:', 'PrismaClientKnownRequestError', 'P2000']]);
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/Secret Corp|1250000/);
  });
});
