import { PrismaClient } from '@prisma/client';

/**
 * Neon serverless behaviour:
 *  - pooled (PgBouncer) hosts need `pgbouncer=true` so Prisma avoids prepared statements;
 *  - an idle project suspends and the first connection can fail while compute wakes (P1001/P1002),
 *    so connection errors are retried with backoff;
 *  - the pool is kept small (Render free instances are tiny, Neon pooled connections are cheap).
 */
export function withPoolDefaults(raw: string): string {
  const u = new URL(raw);
  const setDefault = (k: string, v: string): void => {
    if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  };
  if (u.hostname.includes('-pooler')) setDefault('pgbouncer', 'true');
  setDefault('connect_timeout', '15');
  setDefault('pool_timeout', '20');
  setDefault('connection_limit', '5');
  return u.toString();
}

/** Errors where no statement ran: unreachable server, connect/pool timeouts. Safe to retry any operation. */
const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P1008', 'P2024']);

export const isTransient = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && TRANSIENT_CODES.has(String((e as { code: unknown }).code));

export async function retryTransient<T>(fn: () => Promise<T>, attempts = 5, baseMs = 400): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1 || !isTransient(e)) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
}

export function createPrisma(databaseUrl: string) {
  const client = new PrismaClient({ datasourceUrl: withPoolDefaults(databaseUrl), log: ['error'] });
  return client.$extends({
    query: {
      $allOperations: ({ args, query }) => retryTransient(() => query(args)),
    },
  });
}

export type Db = ReturnType<typeof createPrisma>;
