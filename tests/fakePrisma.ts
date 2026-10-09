/**
 * A small in-memory stand-in for the Prisma client.
 *
 * It exists so tests can assert on the STATE the code leaves behind — which
 * rows are frozen, which snapshots survive, whether a pending income became
 * exactly one Income — instead of on which mock methods were called. The old
 * tests/payment.test.ts hand-wrote the snapshot rows it then asserted on, so
 * the payment path had no real coverage; tests/payments.test.ts replaced it
 * and runs against this fake.
 *
 * The Telegram intake leans on database behaviour for its correctness, so the
 * fake emulates that behaviour rather than just storing rows:
 *  - `$transaction` rolls back. A throw inside the callback restores every
 *    table, so a failed approve really does leave its row OPEN.
 *  - PendingIncome's two unique constraints raise P2002. That is how a
 *    redelivered update or the second item of an album is turned away.
 *  - Conditional writes (`gt`/`gte`/`lt`/`lte`/`not`, `{ increment }`) report
 *    the count the optimistic-concurrency checks branch on.
 *  - `pendingIncome.update` throws P2025 when no row matches, so a stale
 *    `version` in its `where` fails as it does in Prisma.
 *
 * Only the query shapes this codebase actually issues are supported. An
 * unsupported shape throws loudly rather than silently returning nothing. On
 * the new tables so does a `where` the intake does not use: any PendingIncome
 * key outside its list, and a User lookup by anything but `id` or a bigint
 * `telegramId`.
 */

export interface FakeIncome {
  id: string;
  userId: string;
  month: string;
  amount: number;
  percentage: number;
  maaser: number;
  description?: string | null;
  isFrozen: boolean;
  createdAt?: Date;
}

export interface FakeCharity {
  id: string;
  userId: string;
  name: string;
  amount: number;
  isActive: boolean;
}

export interface FakeSnapshot {
  id: string;
  month: string;
  groupOwnerId: string;
  totalGroupMaaser: number;
  totalGroupFixedCharities: number;
  groupAmountPaid: number;
  memberStates: unknown;
  paidAt: Date;
  members: { userId: string }[];
}

export interface FakePartnership {
  id: string;
  user1Id: string;
  user2Id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
}

export interface FakeUser {
  id: string;
  name: string | null;
  telegramId: bigint | null;
  locale: string;
  defaultPercent: number;
}

export interface FakePendingIncome {
  id: string;
  userId: string;
  chatId: bigint;
  sourceMessageId: number;
  mediaGroupId: string | null;
  viaImage: boolean;
  cardMessageId: number | null;
  candidates: unknown;
  amount: number | null;
  month: string | null;
  depositDate: string | null;
  dateFromImage: boolean;
  description: string | null;
  percentage: number | null;
  status: 'READING' | 'OPEN' | 'APPROVED' | 'CANCELLED';
  version: number;
  incomeId: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface FakeDb {
  incomes: FakeIncome[];
  charities: FakeCharity[];
  snapshots: FakeSnapshot[];
  partnerships: FakePartnership[];
  users: FakeUser[];
  pendingIncomes: FakePendingIncome[];
}

type Where = Record<string, unknown>;
type OrderBy = { createdAt: 'asc' | 'desc' };

/** What a create must name; every other column has a database default. */
type PendingIncomeCreate = Partial<Omit<FakePendingIncome, 'id'>> &
  Pick<FakePendingIncome, 'userId' | 'chatId' | 'sourceMessageId' | 'expiresAt'>;
type PendingIncomeData = {
  [K in keyof FakePendingIncome]?: FakePendingIncome[K] | { increment: number };
};

/** The `where` keys the intake filters PendingIncome on. Anything else is a typo or a new query. */
const PENDING_INCOME_WHERE_KEYS = new Set([
  'id', 'userId', 'chatId', 'status', 'version', 'expiresAt', 'createdAt',
  'amount', 'month', 'cardMessageId', 'viaImage', 'sourceMessageId',
]);

/** Dates compare by instant, as they do in the database, not by object identity. */
const comparable = (v: unknown) => (v instanceof Date ? v.getTime() : v);
const equals = (a: unknown, b: unknown) => comparable(a) === comparable(b);
// Numbers, strings and bigints all order with `<`; the cast only satisfies the compiler.
const less = (a: unknown, b: unknown) => (comparable(a) as number) < (comparable(b) as number);

/**
 * Matches a plain value (`null` meaning IS NULL) or an operator object that
 * combines `in`, `not`, `gt`, `gte`, `lt` and `lte`. A NULL column fails every
 * operator, as in SQL — so `{ not: null }` is IS NOT NULL, and `{ not: 5 }`
 * does not match a NULL.
 */
function matches(actual: unknown, condition: unknown): boolean {
  if (condition === undefined) return true;
  if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
    return equals(actual, condition);
  }
  return Object.entries(condition).every(([op, operand]) => {
    if (operand === undefined) return true;
    if (actual === null || actual === undefined) return false;
    switch (op) {
      case 'in': return (operand as unknown[]).some((v) => equals(actual, v));
      case 'not': return !matches(actual, operand);
      case 'gt': return less(operand, actual);
      case 'gte': return !less(actual, operand);
      case 'lt': return less(actual, operand);
      case 'lte': return !less(operand, actual);
      default: throw new Error(`fakePrisma: unsupported filter operator "${op}"`);
    }
  });
}

const isIncrement = (v: unknown): v is { increment: number } =>
  typeof v === 'object' && v !== null && 'increment' in v;

/** Prisma reads an `undefined` field as "not given", so it must not overwrite a default. */
const defined = <T extends object>(data: T): T =>
  Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as T;

/** An update's `data`: `undefined` leaves a column alone and `{ increment: n }` adds n. */
function applyData(row: object, data: object) {
  const target = row as Record<string, unknown>;
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    target[key] = isIncrement(value) ? (target[key] as number) + value.increment : value;
  }
}

/** Newest-row lookups are the only ordering the code asks for. */
function ordered<T extends { createdAt?: Date }>(rows: T[], orderBy?: OrderBy): T[] {
  if (!orderBy) return rows;
  if (Object.keys(orderBy).join() !== 'createdAt') {
    throw new Error(`fakePrisma: unsupported orderBy ${JSON.stringify(orderBy)}`);
  }
  const sign = orderBy.createdAt === 'desc' ? -1 : 1;
  return [...rows].sort(
    (a, b) => sign * ((a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
  );
}

export function createFakePrisma(seed: Partial<FakeDb> & { now?: () => Date } = {}) {
  const db: FakeDb = {
    incomes: seed.incomes ? [...seed.incomes] : [],
    charities: seed.charities ? [...seed.charities] : [],
    snapshots: seed.snapshots ? [...seed.snapshots] : [],
    partnerships: seed.partnerships ? [...seed.partnerships] : [],
    users: seed.users ? [...seed.users] : [],
    pendingIncomes: seed.pendingIncomes ? [...seed.pendingIncomes] : [],
  };
  const now = seed.now ?? (() => new Date());

  let idSeq = 0;
  const nextId = (p: string) => `${p}-${++idSeq}`;
  // The bot puts a PendingIncome id into callback_data and rejects anything
  // that is not cuid-shaped, so these ids must look like the real ones.
  const nextCuid = () => `c${String(++idSeq).padStart(24, '0')}`;

  const incomeMatches = (row: FakeIncome, where: Where = {}) =>
    matches(row.id, where.id) &&
    matches(row.userId, where.userId) &&
    matches(row.month, where.month) &&
    matches(row.amount, where.amount) &&
    matches(row.isFrozen, where.isFrozen);

  const snapshotMatches = (row: FakeSnapshot, where: Where = {}) => {
    if (!matches(row.month, where.month)) return false;
    if (where.id !== undefined && !matches(row.id, where.id)) return false;
    const members = where.members as { some?: { userId?: unknown } } | undefined;
    if (members?.some?.userId !== undefined) {
      return row.members.some((m) => matches(m.userId, members.some!.userId));
    }
    return true;
  };

  // Checked before filtering, so an unknown key throws even on an empty table.
  const pendingIncomesWhere = (where: Where = {}) => {
    for (const key of Object.keys(where)) {
      if (!PENDING_INCOME_WHERE_KEYS.has(key)) {
        throw new Error(`fakePrisma: unsupported pendingIncome where key "${key}"`);
      }
    }
    return db.pendingIncomes.filter((row) =>
      Object.entries(where).every(([key, condition]) =>
        matches(row[key as keyof FakePendingIncome], condition)
      )
    );
  };

  // Prisma's extended where-unique: `id` picks the row, and every other key
  // (a `version`, a `status`) must match too, or the row counts as missing.
  const pendingIncomeById = (method: string, where: Where) => {
    if (typeof where.id !== 'string') {
      throw new Error(`fakePrisma: pendingIncome.${method} needs where.id`);
    }
    return pendingIncomesWhere(where)[0];
  };

  const userById = (id: string) => {
    const hit = db.users.find((u) => u.id === id);
    return hit ? { ...hit } : null;
  };

  const tables = {
    income: {
      findMany: async ({ where = {}, orderBy }: { where?: Where; orderBy?: OrderBy } = {}) =>
        ordered(db.incomes.filter((r) => incomeMatches(r, where)), orderBy).map((r) => ({ ...r })),
      findFirst: async ({ where = {}, orderBy }: { where?: Where; orderBy?: OrderBy } = {}) => {
        const hit = ordered(db.incomes.filter((r) => incomeMatches(r, where)), orderBy)[0];
        return hit ? { ...hit } : null;
      },
      create: async ({ data }: { data: Omit<FakeIncome, 'id' | 'isFrozen' | 'createdAt'> }) => {
        const row: FakeIncome = {
          id: nextId('inc'),
          userId: data.userId,
          month: data.month,
          amount: data.amount,
          percentage: data.percentage,
          maaser: data.maaser,
          description: data.description ?? null,
          isFrozen: false,
          createdAt: now(),
        };
        db.incomes.push(row);
        return { ...row };
      },
      updateMany: async ({ where = {}, data }: { where?: Where; data: Partial<FakeIncome> }) => {
        let count = 0;
        for (const row of db.incomes) {
          if (incomeMatches(row, where)) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      },
    },

    fixedCharity: {
      findMany: async ({ where = {} }: { where?: Where } = {}) =>
        db.charities
          .filter(
            (r) =>
              matches(r.userId, where.userId) &&
              (where.isActive === undefined || r.isActive === where.isActive)
          )
          .map((r) => ({ ...r })),
    },

    groupPaymentSnapshot: {
      findMany: async ({ where = {} }: { where?: Where } = {}) =>
        db.snapshots.filter((r) => snapshotMatches(r, where)).map((r) => ({ ...r })),
      findFirst: async ({ where = {} }: { where?: Where } = {}) => {
        const hit = db.snapshots.find((r) => snapshotMatches(r, where));
        return hit ? { ...hit } : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const hit = db.snapshots.find((r) => r.id === where.id);
        return hit ? { ...hit } : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const members =
          (data.members as { create?: { userId: string }[] } | undefined)?.create ?? [];
        const row: FakeSnapshot = {
          id: nextId('snap'),
          month: data.month as string,
          groupOwnerId: data.groupOwnerId as string,
          totalGroupMaaser: data.totalGroupMaaser as number,
          totalGroupFixedCharities: data.totalGroupFixedCharities as number,
          groupAmountPaid: data.groupAmountPaid as number,
          memberStates: data.memberStates,
          paidAt: new Date('2026-09-15T00:00:00Z'),
          members: members.map((m) => ({ userId: m.userId })),
        };
        db.snapshots.push(row);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const i = db.snapshots.findIndex((r) => r.id === where.id);
        if (i === -1) throw new Error(`snapshot ${where.id} not found`);
        const [removed] = db.snapshots.splice(i, 1);
        return removed;
      },
    },

    partnership: {
      findFirst: async ({
        where = {},
        include,
      }: { where?: Where; include?: { user1?: unknown; user2?: unknown } } = {}) => {
        const or = (where.OR as Array<Record<string, unknown>> | undefined) ?? [];
        const hit = db.partnerships.find((p) => {
          if (where.status !== undefined && p.status !== where.status) return false;
          if (or.length === 0) return true;
          return or.some((clause) =>
            Object.entries(clause).every(([k, v]) => matches((p as never)[k], v))
          );
        });
        if (!hit) return null;
        // `select` inside the include is ignored: the whole user row comes back.
        const row: FakePartnership & { user1?: FakeUser | null; user2?: FakeUser | null } = {
          ...hit,
        };
        if (include?.user1) row.user1 = userById(hit.user1Id);
        if (include?.user2) row.user2 = userById(hit.user2Id);
        return row;
      },
    },

    user: {
      // Exactly one of the two unique keys. Any other lookup, such as an
      // `email` or a number where the column is a bigint, would match no row
      // and let an "unknown sender" test pass for the wrong reason.
      // `select` is ignored: the whole row comes back.
      findUnique: async ({
        where,
      }: {
        where: { id: string } | { telegramId: bigint };
        select?: unknown;
      }) => {
        const keys = Object.keys(where);
        const [key] = keys;
        if (keys.length !== 1 || (key !== 'id' && key !== 'telegramId')) {
          throw new Error(
            `fakePrisma: user.findUnique takes where { id } or { telegramId }, got [${keys}]`
          );
        }
        const value = (where as Where)[key];
        if (key === 'telegramId' && typeof value !== 'bigint') {
          throw new Error('fakePrisma: user.findUnique needs telegramId as a bigint');
        }
        if (key === 'id' && typeof value !== 'string') {
          throw new Error('fakePrisma: user.findUnique needs id as a string');
        }
        const hit = db.users.find((u) => u[key] === value);
        return hit ? { ...hit } : null;
      },
    },

    pendingIncome: {
      create: async ({ data }: { data: PendingIncomeCreate }) => {
        const row: FakePendingIncome = {
          id: nextCuid(),
          mediaGroupId: null,
          viaImage: true,
          cardMessageId: null,
          candidates: [],
          amount: null,
          month: null,
          depositDate: null,
          dateFromImage: true,
          description: null,
          percentage: null,
          status: 'READING',
          version: 0,
          incomeId: null,
          createdAt: now(),
          ...defined(data),
        };
        // Postgres treats NULLs as distinct, so rows outside an album never
        // collide on (chatId, mediaGroupId).
        const taken = db.pendingIncomes.some(
          (r) =>
            r.chatId === row.chatId &&
            (r.sourceMessageId === row.sourceMessageId ||
              (row.mediaGroupId !== null && r.mediaGroupId === row.mediaGroupId))
        );
        if (taken) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        db.pendingIncomes.push(row);
        return { ...row };
      },
      findUnique: async ({ where }: { where: { id: string } & Where }) => {
        const hit = pendingIncomeById('findUnique', where);
        return hit ? { ...hit } : null;
      },
      findFirst: async ({ where, orderBy }: { where?: Where; orderBy?: OrderBy } = {}) => {
        const hit = ordered(pendingIncomesWhere(where), orderBy)[0];
        return hit ? { ...hit } : null;
      },
      findMany: async ({ where }: { where?: Where } = {}) =>
        pendingIncomesWhere(where).map((r) => ({ ...r })),
      count: async ({ where }: { where?: Where } = {}) => pendingIncomesWhere(where).length,
      update: async ({
        where,
        data,
      }: {
        where: { id: string } & Where;
        data: PendingIncomeData;
      }) => {
        const row = pendingIncomeById('update', where);
        // What Prisma throws when the row to update is missing or a filter misses.
        if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
        applyData(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }: { where?: Where; data: PendingIncomeData }) => {
        const hits = pendingIncomesWhere(where);
        for (const row of hits) applyData(row, data);
        return { count: hits.length };
      },
      deleteMany: async ({ where }: { where?: Where } = {}) => {
        const hits = new Set(pendingIncomesWhere(where));
        const kept = db.pendingIncomes.filter((r) => !hits.has(r));
        db.pendingIncomes.splice(0, db.pendingIncomes.length, ...kept);
        return { count: hits.size };
      },
    },
  };

  type Tables = typeof tables;
  interface FakeClient extends Tables {
    $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
    $transaction<T>(fn: (tx: FakeClient) => Promise<T>): Promise<T>;
  }

  const client: FakeClient = {
    ...tables,
    // Approve takes a per-user advisory lock with it. The fake runs one
    // callback at a time, so there is nothing to lock.
    $executeRaw: async () => 0,
    // Prisma hands the callback a scoped client; the fake hands over itself,
    // so `tx.$executeRaw` exists. A throw puts every table back as it was —
    // in place, because tests hold references to the `db` arrays.
    $transaction: async (fn) => {
      const snapshot = structuredClone(db);
      try {
        return await fn(client);
      } catch (err) {
        for (const key of Object.keys(db) as (keyof FakeDb)[]) {
          const table = db[key] as unknown[];
          table.splice(0, table.length, ...(snapshot[key] as unknown[]));
        }
        throw err;
      }
    },
  };

  return { client, db };
}
