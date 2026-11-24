import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

/** Ask the OS for a free TCP port so a leftover server from a crashed run can never collide. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

/**
 * Tests run against a real PostgreSQL started just for the run (embedded-postgres), with the committed
 * migrations applied by `prisma migrate deploy`. No Docker and no external database needed.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const dir = mkdtempSync(join(tmpdir(), 'crane-test-pg-'));
  const port = await freePort();
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'crane', password: 'crane', port, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  const stop = async (): Promise<void> => {
    await pg.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };

  try {
    await pg.createDatabase('crane_test');
    const url = `postgresql://crane:crane@localhost:${port}/crane_test`;
    const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: join(import.meta.dirname, '..'),
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      stdio: 'pipe',
    });
    project.provide('dbUrl', url);
  } catch (e) {
    await stop();
    throw e;
  }
  return stop;
}
