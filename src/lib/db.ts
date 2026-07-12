import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { ensureSqliteSchema } from "@/lib/ensure-sqlite-schema";
import { resolveSqliteFilePath } from "@/lib/sqlite-path";
import { repairBusyPaymentCustomerLinks } from "@/lib/repair-payment-party-links";

type PrismaCache = {
  client: PrismaClient | null;
  connectPromise: Promise<void> | null;
  /** Bumps when schema delegates must be reloaded (HMR / wipe). */
  generation: number;
};

declare global {
  // eslint-disable-next-line no-var
  var prismaCache: PrismaCache | undefined;
}

const cache: PrismaCache = global.prismaCache ?? {
  client: null,
  connectPromise: null,
  generation: 0,
};

if (process.env.NODE_ENV !== "production") {
  global.prismaCache = cache;
}

const REQUIRED_DELEGATES = [
  "party",
  "bill",
  "item",
  "payment",
  "category",
  "bankAccount",
  "ledgerTransaction",
  "daybook",
  "daybookExpense",
  "accountGroup",
  "ledgerAccount",
  "voucher",
  "voucherAccountLine",
  "voucherItemLine",
  "billPaymentSplit",
  "sundryType",
  "employee",
  "employeeAttendance",
  "employeeAdvance",
  "employeePayroll",
] as const;

function delegateOk(client: PrismaClient, name: string): boolean {
  const d = (client as unknown as Record<string, unknown>)[name];
  if (d == null || typeof d !== "object") return false;
  return typeof (d as { count?: unknown }).count === "function";
}

function clientHasRequiredDelegates(client: PrismaClient): boolean {
  return REQUIRED_DELEGATES.every((name) => delegateOk(client, name));
}

async function disposeClient(client: PrismaClient | null) {
  if (!client) return;
  try {
    await client.$disconnect();
  } catch {
    // ignore
  }
}

function createClient(): PrismaClient {
  ensureSqliteSchema();
  const sqlitePath = resolveSqliteFilePath();
  const adapter = new PrismaBetterSqlite3({ url: sqlitePath });
  const client = new PrismaClient({ adapter });
  if (!clientHasRequiredDelegates(client)) {
    throw new Error(
      "Prisma client is missing model delegates (accountGroup/voucher/…). Run `npx prisma generate` and restart the dev server.",
    );
  }
  return client;
}

function getClient(): PrismaClient {
  if (cache.client && !clientHasRequiredDelegates(cache.client)) {
    const stale = cache.client;
    cache.client = null;
    cache.connectPromise = null;
    cache.generation += 1;
    void disposeClient(stale);
  }

  if (!cache.client) {
    cache.client = createClient();
  }
  return cache.client;
}

/**
 * Drop the in-memory Prisma client so the next call rebuilds against current schema/DB.
 */
export async function resetPrismaClient(): Promise<void> {
  const stale = cache.client;
  cache.client = null;
  cache.connectPromise = null;
  cache.generation += 1;
  await disposeClient(stale);
}

/**
 * Direct accessor — prefer this over nested Proxy edge cases when debugging.
 */
export function getPrisma(): PrismaClient {
  return getClient();
}

/**
 * Lazy proxy so routes can keep using `db.model.*`.
 * Important: never pass the Proxy as Reflect.get receiver — Prisma delegates
 * need the real client as `this`.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (typeof prop === "symbol") {
      return Reflect.get(getClient(), prop, getClient());
    }
    const client = getClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
  has(_target, prop) {
    return prop in getClient();
  },
});

/**
 * Compatibility shim (many routes currently call connectDb()).
 */
export async function connectDb(): Promise<void> {
  if (!cache.connectPromise) {
    const gen = cache.generation;
    cache.connectPromise = (async () => {
      try {
        ensureSqliteSchema();
        // Recreate if HMR left a stale client without new delegates
        getClient();
        await getClient().$connect();
        try {
          await repairBusyPaymentCustomerLinks();
        } catch (repairErr) {
          // Soft-fail repairs on empty/fresh DBs
          console.warn(
            "[connectDb] repair skipped:",
            repairErr instanceof Error ? repairErr.message : repairErr,
          );
        }
        // If another reset happened while connecting, drop this promise
        if (gen !== cache.generation) {
          cache.connectPromise = null;
        }
      } catch (error) {
        cache.connectPromise = null;
        const message =
          error instanceof Error ? error.message : "Unknown DB error";
        throw new Error(`Failed to connect to SQLite via Prisma. ${message}`);
      }
    })();
  }
  await cache.connectPromise;
}
