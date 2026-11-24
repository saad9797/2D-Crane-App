import { existsSync } from 'node:fs';
import { createApp } from './app';
import { createPrisma, retryTransient } from './db';
import { EnvError, loadEnv } from './env';
import { logger } from './logger';

// Local convenience: read apps/api/.env when present. Hosts (Render) inject real environment variables.
if (existsSync('.env')) process.loadEnvFile('.env');

let env;
try {
  env = loadEnv();
} catch (e) {
  if (e instanceof EnvError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

const log = logger(env.LOG_LEVEL);
const db = createPrisma(env.DATABASE_URL);

// Neon computes suspend when idle: the first connect can fail while it wakes, so retry with backoff.
await retryTransient(() => db.$connect(), 8, 500).catch((e: unknown) => {
  log.fatal({ err: e }, 'could not connect to the database');
  process.exit(1);
});

const app = createApp({ env, db });
const server = app.listen(env.PORT, () => log.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening'));

let closing = false;
const shutdown = (signal: string): void => {
  if (closing) return;
  closing = true;
  log.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(() => {
    void db.$disconnect().finally(() => process.exit(0));
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
