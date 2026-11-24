/**
 * Local Postgres without Docker: starts a real PostgreSQL server (via the `embedded-postgres`
 * package) on port 5433 with the same credentials as docker-compose.yml, and keeps it running
 * until you press Ctrl+C. Data lives in ./.embedded-pg and survives restarts.
 *
 *   npm run db:embedded
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const dir = resolve(process.cwd(), '.embedded-pg', 'data');
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'crane',
  password: 'crane',
  port: 5433,
  persistent: true,
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});

if (!existsSync(resolve(dir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('crane');
} catch {
  // already exists
}
console.log('Embedded PostgreSQL is running: postgresql://crane:crane@localhost:5433/crane');
console.log('Press Ctrl+C to stop.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
