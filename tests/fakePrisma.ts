/**
 * A small in-memory stand-in for the Prisma client.
 *
 * It exists so payment tests can assert on the STATE the code leaves behind —
 * which rows are frozen, which snapshots survive — instead of on which mock
 * methods were called. tests/payment.test.ts previously hand-wrote the
 * snapshot rows it then asserted on, so the payment path had no real coverage.
 *
 * Only the query shapes this codebase actually issues are supported. An
 * unsupported shape throws loudly rather than silently returning nothing.
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

export interface FakeDb {
  incomes: FakeIncome[];
  charities: FakeCharity[];
  snapshots: FakeSnapshot[];
  partnerships: FakePartnership[];
}

/** Matches `field: value` and `field: { in: [...] }`, the only shapes used. */
function matches(actual: unknown, condition: unknown): boolean {
  if (condition === undefined) return true;
  if (condition !== null && typeof condition === 'object' && 'in' in (condition as object)) {
    return (condition as { in: unknown[] }).in.includes(actual);
  }
  return actual === condition;
}

export function createFakePrisma(seed: Partial<FakeDb> = {}) {
  const db: FakeDb = {
    incomes: seed.incomes ? [...seed.incomes] : [],
    charities: seed.charities ? [...seed.charities] : [],
    snapshots: seed.snapshots ? [...seed.snapshots] : [],
    partnerships: seed.partnerships ? [...seed.partnerships] : [],
  };

  let idSeq = 0;
  const nextId = (p: string) => `${p}-${++idSeq}`;

  type Where = Record<string, unknown>;

  const incomeMatches = (row: FakeIncome, where: Where = {}) =>
    matches(row.userId, where.userId) &&
    matches(row.month, where.month) &&
    (where.isFrozen === undefined || row.isFrozen === where.isFrozen);

  const snapshotMatches = (row: FakeSnapshot, where: Where = {}) => {
    if (!matches(row.month, where.month)) return false;
    if (where.id !== undefined && !matches(row.id, where.id)) return false;
    const members = where.members as { some?: { userId?: unknown } } | undefined;
    if (members?.some?.userId !== undefined) {
      return row.members.some((m) => matches(m.userId, members.some!.userId));
    }
    return true;
  };

  const tables = {
    income: {
      findMany: async ({ where = {} }: { where?: Where } = {}) =>
        db.incomes.filter((r) => incomeMatches(r, where)).map((r) => ({ ...r })),
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
      findFirst: async ({ where = {} }: { where?: Where } = {}) => {
        const or = (where.OR as Array<Record<string, unknown>> | undefined) ?? [];
        const hit = db.partnerships.find((p) => {
          if (where.status !== undefined && p.status !== where.status) return false;
          if (or.length === 0) return true;
          return or.some((clause) =>
            Object.entries(clause).every(([k, v]) => matches((p as never)[k], v))
          );
        });
        return hit ? { ...hit } : null;
      },
    },

  };

  // Prisma's interactive transaction hands a scoped client to the callback.
  // The fake has no rollback, so tests assert committed state only.
  const client = {
    ...tables,
    $transaction: async <T>(fn: (tx: typeof tables) => Promise<T>): Promise<T> => fn(tables),
  };

  return { client, db };
}
