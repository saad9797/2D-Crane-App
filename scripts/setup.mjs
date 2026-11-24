/**
 * One-time local setup (run through `npm run setup`, which runs `npm install` first):
 *   1. create apps/api/.env and apps/web/.env from the .env.example files if missing
 *   2. make sure a PostgreSQL is reachable (start docker-compose if needed)
 *   3. apply the committed migrations and seed the demo account
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...opts });

for (const app of ['api', 'web']) {
  const env = resolve(root, 'apps', app, '.env');
  if (!existsSync(env)) {
    copyFileSync(resolve(root, 'apps', app, '.env.example'), env);
    console.log(`Created apps/${app}/.env from .env.example`);
  }
}

const dbUrl = /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(resolve(root, 'apps/api/.env'), 'utf8'))?.[1] ?? '';
const { hostname, port } = new URL(dbUrl);
const isLocal = ['localhost', '127.0.0.1'].includes(hostname);

const reachable = (host, p) =>
  new Promise((ok) => {
    const s = connect({ host, port: Number(p) || 5432, timeout: 1500 });
    s.once('connect', () => (s.destroy(), ok(true)));
    s.once('error', () => ok(false));
    s.once('timeout', () => (s.destroy(), ok(false)));
  });

if (isLocal && !(await reachable(hostname, port))) {
  const docker = spawnSync('docker', ['--version'], { shell: process.platform === 'win32', stdio: 'ignore' });
  if (docker.status === 0) {
    console.log('Starting PostgreSQL with Docker Compose...');
    if (run('docker', ['compose', 'up', '-d', '--wait']).status !== 0) process.exit(1);
  } else {
    console.error(
      `\nNo database is listening on ${hostname}:${port} and Docker was not found.\n` +
        'Pick one:\n' +
        '  - install Docker, then run `npm run setup` again; or\n' +
        '  - run `npm run db:embedded` in a second terminal (a real PostgreSQL, no Docker), then run `npm run setup` again; or\n' +
        '  - put any PostgreSQL / Neon connection strings in apps/api/.env (DATABASE_URL and DIRECT_URL).\n',
    );
    process.exit(1);
  }
}

console.log('Applying migrations...');
if (run('npm', ['run', 'db:deploy', '-w', '@crane/api']).status !== 0) process.exit(1);
console.log('Seeding the demo account...');
if (run('npm', ['run', 'db:seed', '-w', '@crane/api']).status !== 0) process.exit(1);

console.log('\nAll set. Start the app with:  npm run dev\n  web  http://localhost:5173\n  api  http://localhost:4000/api/v1/health\n  demo demo@example.com / CraneDemo2026!\n');
