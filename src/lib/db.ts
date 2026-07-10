import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { resolveSqliteFilePath } from "@/lib/sqlite-path";

type PrismaCache = {
  client: PrismaClient | null;
  connectPromise: Promise<void> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var prismaCache: PrismaCache | undefined;
}

const cache: PrismaCache = global.prismaCache ?? {
  client: null,
  connectPromise: null,
};

if (process.env.NODE_ENV !== "production") {
  global.prismaCache = cache;
}

function getClient(): PrismaClient {
  if (!cache.client) {
    const sqlitePath = resolveSqliteFilePath();
    const adapter = new PrismaBetterSqlite3({ url: sqlitePath });
    cache.client = new PrismaClient({ adapter });
  }
  return cache.client;
}

/**
 * Lazy proxy: do not construct Prisma at module load time. If initialization
 * throws (bad DATABASE_URL, native module load), a top-level failure would
 * bypass route try/catch and yield Next's generic "Internal Server Error".
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver) as unknown;
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
  has(_target, prop) {
    return Reflect.has(getClient(), prop);
  },
});

/**
 * Compatibility shim (many routes currently call connectDb()).
 * Prisma lazily connects, but we eagerly validate env and connect once.
 */
export async function connectDb(): Promise<void> {
  if (!cache.connectPromise) {
    cache.connectPromise = db.$connect().catch((error) => {
      cache.connectPromise = null;
      const message = error instanceof Error ? error.message : "Unknown DB error";
      throw new Error(`Failed to connect to SQLite via Prisma. ${message}`);
    });
  }
  await cache.connectPromise;
}
