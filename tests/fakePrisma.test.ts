import { describe, expect, it } from 'vitest';
import { createFakePrisma } from './fakePrisma';

const base = { userId: 'u1', chatId: BigInt(1), viaImage: true, expiresAt: new Date('2026-10-12T00:00:00Z') };

describe('fakePrisma', () => {
  it('rolls a transaction back when the callback throws', async () => {
    const { client, db } = createFakePrisma();
    const row = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 1 } });
    await expect(client.$transaction(async (tx) => {
      await tx.pendingIncome.updateMany({ where: { id: row.id }, data: { status: 'APPROVED' } });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(db.pendingIncomes[0].status).toBe('READING');
  });

  it('rolls back an income created inside the transaction', async () => {
    const { client, db } = createFakePrisma();
    await expect(client.$transaction(async (tx) => {
      await tx.income.create({ data: { userId: 'u1', month: '2026-10', amount: 1000, percentage: 10, maaser: 100 } });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(db.incomes).toEqual([]);
  });

  it("runs one transaction at a time, so a rollback never undoes another's write", async () => {
    const { client, db } = createFakePrisma();
    const row = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 1 } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    const failing = client.$transaction(async (tx) => {
      await tx.pendingIncome.updateMany({ where: { id: row.id }, data: { amount: 1 } });
      await gate;
      throw new Error('boom');
    });
    const other = client.$transaction((tx) =>
      tx.pendingIncome.updateMany({ where: { id: row.id }, data: { version: { increment: 1 } } })
    );
    release();

    await expect(failing).rejects.toThrow('boom');
    await expect(other).resolves.toEqual({ count: 1 });
    expect(db.pendingIncomes[0]).toMatchObject({ amount: null, version: 1 });
  });

  it('emulates P2002 on (chatId, sourceMessageId) and (chatId, mediaGroupId)', async () => {
    const { client } = createFakePrisma();
    await client.pendingIncome.create({ data: { ...base, sourceMessageId: 1, mediaGroupId: 'g' } });
    await expect(client.pendingIncome.create({ data: { ...base, sourceMessageId: 1 } }))
      .rejects.toMatchObject({ code: 'P2002' });
    await expect(client.pendingIncome.create({ data: { ...base, sourceMessageId: 2, mediaGroupId: 'g' } }))
      .rejects.toMatchObject({ code: 'P2002' });
    // NULL media groups never collide.
    await client.pendingIncome.create({ data: { ...base, sourceMessageId: 3 } });
    await client.pendingIncome.create({ data: { ...base, sourceMessageId: 4 } });
  });

  it('supports increment, gt and not in a conditional updateMany', async () => {
    const { client } = createFakePrisma();
    const row = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 1, status: 'OPEN' } });
    const ok = await client.pendingIncome.updateMany({
      where: { id: row.id, status: 'OPEN', version: 0, expiresAt: { gt: new Date('2026-10-10T00:00:00Z') }, amount: { not: null } },
      data: { version: { increment: 1 } },
    });
    expect(ok.count).toBe(0); // amount is null
    const ok2 = await client.pendingIncome.updateMany({
      where: { id: row.id, status: 'OPEN', version: 0, expiresAt: { gt: new Date('2026-10-10T00:00:00Z') } },
      data: { version: { increment: 1 }, amount: 100 },
    });
    expect(ok2.count).toBe(1);
    expect((await client.pendingIncome.findUnique({ where: { id: row.id } }))!.version).toBe(1);
  });

  it('throws on an unknown where key for pendingIncome', async () => {
    const { client } = createFakePrisma();
    await expect(client.pendingIncome.findFirst({ where: { nope: 1 } as never })).rejects.toThrow();
  });

  it('matches income by id and amount range', async () => {
    const { client } = createFakePrisma({ incomes: [
      { id: 'i1', userId: 'u1', month: '2026-10', amount: 1000, percentage: 10, maaser: 100, isFrozen: false },
    ] });
    expect(await client.income.findFirst({ where: { id: 'i2', userId: 'u1' } })).toBeNull();
    expect(await client.income.findFirst({ where: { userId: { in: ['u1'] }, month: { in: ['2026-10'] }, amount: { gte: 900, lte: 1100 } } }))
      .toMatchObject({ id: 'i1' });
  });

  it('stamps createdAt from now() and orders by it', async () => {
    let clock = new Date('2026-10-01T00:00:00Z');
    const { client } = createFakePrisma({ now: () => clock });
    const first = await client.income.create({ data: { userId: 'u1', month: '2026-10', amount: 1000, percentage: 10, maaser: 100 } });
    clock = new Date('2026-10-02T00:00:00Z');
    const second = await client.income.create({ data: { userId: 'u1', month: '2026-10', amount: 2000, percentage: 10, maaser: 200 } });
    expect(first).toMatchObject({ isFrozen: false, description: null, createdAt: new Date('2026-10-01T00:00:00Z') });
    expect(await client.income.findFirst({ where: { userId: 'u1' }, orderBy: { createdAt: 'desc' } }))
      .toMatchObject({ id: second.id });

    await client.pendingIncome.create({ data: { ...base, sourceMessageId: 1 } });
    clock = new Date('2026-10-03T00:00:00Z');
    const newer = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 2 } });
    expect(await client.pendingIncome.findFirst({ where: { userId: 'u1' }, orderBy: { createdAt: 'desc' } }))
      .toMatchObject({ id: newer.id });
  });

  it('keeps the status and version a create names, and counts and deletes by filter', async () => {
    const { client, db } = createFakePrisma();
    const typed = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 1, status: 'OPEN', version: 1, viaImage: false } });
    expect(typed).toMatchObject({ status: 'OPEN', version: 1, viaImage: false, candidates: [], amount: null });
    expect(typed.id).toMatch(/^c[a-z0-9]{20,32}$/);
    const read = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 2 } });
    expect(await client.pendingIncome.count({ where: { userId: 'u1', viaImage: true } })).toBe(1);
    expect(await client.pendingIncome.findMany({ where: { id: { not: typed.id } } })).toMatchObject([{ id: read.id }]);
    expect(await client.pendingIncome.deleteMany({ where: { status: 'READING' } })).toEqual({ count: 1 });
    expect(db.pendingIncomes.map((r) => r.id)).toEqual([typed.id]);
  });

  it('refuses a pendingIncome create with an unknown column or a number chatId', async () => {
    const { client, db } = createFakePrisma();
    await expect(client.pendingIncome.create({ data: { ...base, sourceMessageId: 1, nope: 1 } as never }))
      .rejects.toThrow(/unknown column "nope"/);
    await expect(client.pendingIncome.create({ data: { ...base, sourceMessageId: 1, chatId: 1 } as never }))
      .rejects.toThrow(/bigint/);
    expect(db.pendingIncomes).toEqual([]);
  });

  it('breaks a createdAt tie by insertion order, newest last-added first', async () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const { client } = createFakePrisma({ now: () => at });
    const first = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 1 } });
    const second = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 2 } });
    expect(await client.pendingIncome.findFirst({ where: { userId: 'u1' }, orderBy: { createdAt: 'desc' } }))
      .toMatchObject({ id: second.id });
    expect(await client.pendingIncome.findFirst({ where: { userId: 'u1' }, orderBy: { createdAt: 'asc' } }))
      .toMatchObject({ id: first.id });
  });

  it('treats an undefined field on create as absent, so the default applies', async () => {
    const { client } = createFakePrisma();
    await client.pendingIncome.create({ data: { ...base, sourceMessageId: 1, mediaGroupId: undefined } });
    const second = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 2, mediaGroupId: undefined } });
    expect(second.mediaGroupId).toBeNull();
  });

  it('finds users by telegramId and attaches them to a partnership', async () => {
    const dana = { id: 'u2', name: 'Dana', telegramId: BigInt(99), locale: 'he', defaultPercent: 10 };
    const { client } = createFakePrisma({
      users: [dana],
      partnerships: [{ id: 'p1', user1Id: 'u1', user2Id: 'u2', status: 'ACCEPTED' }],
    });
    expect(await client.user.findUnique({ where: { telegramId: BigInt(99) } })).toEqual(dana);
    expect(await client.user.findUnique({ where: { id: 'u1' } })).toBeNull();
    expect(await client.partnership.findFirst({
      where: { status: 'ACCEPTED', OR: [{ user1Id: 'u1' }, { user2Id: 'u1' }] },
      include: { user1: { select: { name: true } }, user2: { select: { name: true } } },
    })).toMatchObject({ user1: null, user2: dana });
  });

  it('checks every where key on pendingIncome.findUnique and applies each filter', async () => {
    const { client } = createFakePrisma();
    const row = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 1 } });
    await expect(client.pendingIncome.findUnique({ where: { id: row.id, nope: 1 } as never }))
      .rejects.toThrow(/unsupported pendingIncome where key "nope"/);
    await expect(client.pendingIncome.findUnique({ where: { status: 'READING' } as never }))
      .rejects.toThrow(/needs where\.id/);
    expect(await client.pendingIncome.findUnique({ where: { id: row.id, version: 0, status: 'READING' } }))
      .toMatchObject({ id: row.id });
    expect(await client.pendingIncome.findUnique({ where: { id: row.id, version: 1 } })).toBeNull();
  });

  it('checks every where key on pendingIncome.update and throws P2025 when nothing matches', async () => {
    const { client, db } = createFakePrisma();
    const row = await client.pendingIncome.create({ data: { ...base, sourceMessageId: 1 } });
    await expect(client.pendingIncome.update({ where: { id: row.id, nope: 1 } as never, data: { amount: 1 } }))
      .rejects.toThrow(/unsupported pendingIncome where key "nope"/);
    // A stale version is a miss, as Prisma's extended where-unique makes it.
    await expect(client.pendingIncome.update({ where: { id: row.id, version: 5 }, data: { amount: 1 } }))
      .rejects.toMatchObject({ code: 'P2025' });
    await expect(client.pendingIncome.update({ where: { id: 'c-missing' }, data: { amount: 1 } }))
      .rejects.toMatchObject({ code: 'P2025' });
    expect(db.pendingIncomes[0].amount).toBeNull();
    expect(await client.pendingIncome.update({ where: { id: row.id, version: 0 }, data: { amount: 1, version: { increment: 1 } } }))
      .toMatchObject({ amount: 1, version: 1 });
  });

  it('takes exactly one of id or a bigint telegramId on user.findUnique', async () => {
    const dana = { id: 'u2', name: 'Dana', telegramId: BigInt(99), locale: 'he', defaultPercent: 10 };
    const { client } = createFakePrisma({ users: [dana] });
    await expect(client.user.findUnique({ where: { email: 'dana@example.com' } as never }))
      .rejects.toThrow(/user\.findUnique/);
    await expect(client.user.findUnique({ where: { id: 'u2', telegramId: BigInt(99) } as never }))
      .rejects.toThrow(/user\.findUnique/);
    // A number never equals the stored bigint, so it would always miss.
    await expect(client.user.findUnique({ where: { telegramId: 99 } as never }))
      .rejects.toThrow(/bigint/);
    expect(await client.user.findUnique({ where: { id: 'u2' } })).toEqual(dana);
  });

  it('gives the transaction callback a client with $executeRaw', async () => {
    const { client } = createFakePrisma();
    const userId = 'u1';
    await expect(client.$transaction(async (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`))
      .resolves.toBe(0);
  });
});
