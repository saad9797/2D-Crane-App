import DxfParser from 'dxf-parser';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { DEFAULT_INPUTS, PRESETS, type CraneInputs } from '@crane/shared';
import { createApp, DEFAULT_LIMITS, type RateLimits } from '../src/app';
import { createPrisma, isTransient, retryTransient, withPoolDefaults, type Db } from '../src/db';
import { loadEnv, EnvError } from '../src/env';

const SECRET = 'test-secret-test-secret-test-secret-123456';
const API = '/api/v1';
const baseEnv = (): Record<string, string> => ({
  NODE_ENV: 'test',
  DATABASE_URL: inject('dbUrl'),
  JWT_SECRET: SECRET,
  BCRYPT_COST: '4',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173,https://crane.example.com',
});
const HIGH_LIMITS: RateLimits = { login: { windowMs: 60_000, max: 10_000 }, register: { windowMs: 60_000, max: 10_000 }, heavy: { windowMs: 60_000, max: 10_000 } };

let db: Db;
let app: ReturnType<typeof createApp>;
const req = () => supertest(app);
let counter = 0;

async function signUp(email = `user${++counter}-${Date.now()}@example.com`): Promise<{ token: string; id: string; email: string }> {
  const r = await req().post(`${API}/auth/register`).send({ email, password: 'correct horse battery' });
  expect(r.status).toBe(201);
  return { token: r.body.token as string, id: r.body.user.id as string, email };
}
const binary: Parameters<supertest.Test['parse']>[0] = (res, cb) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const newDesign = (token: string, body: Record<string, unknown> = {}) =>
  req().post(`${API}/designs`).set(auth(token)).send({ name: 'Test crane', notes: 'n', inputs: DEFAULT_INPUTS, ...body });

beforeAll(() => {
  db = createPrisma(inject('dbUrl'));
  app = createApp({ env: loadEnv(baseEnv()), db, limits: HIGH_LIMITS });
});
afterAll(async () => {
  await db.$disconnect();
});

describe('platform', () => {
  it('health checks the database', async () => {
    const r = await req().get(`${API}/health`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('reports 503 when the database is down', async () => {
    const down = { $queryRaw: () => Promise.reject(new Error('connection refused')) } as unknown as Db;
    const r = await supertest(createApp({ env: loadEnv(baseEnv()), db: down, limits: HIGH_LIMITS })).get(`${API}/health`);
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ status: 'degraded', db: 'down' });
  });

  it('answers unknown routes with a problem document', async () => {
    const r = await req().get(`${API}/nope`);
    expect(r.status).toBe(404);
    expect(r.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(r.body).toMatchObject({ status: 404, code: 'route_not_found', instance: `${API}/nope` });
  });

  it('rejects malformed JSON with 400', async () => {
    const r = await req().post(`${API}/auth/login`).set('Content-Type', 'application/json').send('{"email": ');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('malformed_json');
  });

  it('rejects oversized bodies with 413', async () => {
    const r = await req().post(`${API}/render`).send({ inputs: DEFAULT_INPUTS, pad: 'x'.repeat(200_000) });
    expect(r.status).toBe(413);
    expect(r.body.code).toBe('payload_too_large');
  });

  it('sets security headers and hides the framework', async () => {
    const r = await req().get(`${API}/health`);
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['x-request-id']).toBeTruthy();
  });

  it('allows only configured CORS origins', async () => {
    const ok = await req().get(`${API}/health`).set('Origin', 'https://crane.example.com');
    expect(ok.headers['access-control-allow-origin']).toBe('https://crane.example.com');
    const bad = await req().get(`${API}/health`).set('Origin', 'https://evil.example.org');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await req().options(`${API}/designs`).set('Origin', 'https://crane.example.com').set('Access-Control-Request-Method', 'PUT');
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-methods']).toContain('PUT');
  });

  it('never leaks internals on unexpected errors', async () => {
    const { token } = await signUp();
    const broken = { user: db.user, design: { count: () => Promise.reject(new Error('secret database detail at /srv/app.ts:12')), findMany: () => Promise.resolve([]) } } as unknown as Db;
    const r = await supertest(createApp({ env: loadEnv(baseEnv()), db: broken, limits: HIGH_LIMITS })).get(`${API}/designs`).set(auth(token));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secret|\.ts|stack/i);
    expect(r.body).toMatchObject({ status: 500, code: 'internal_error' });
  });
});

describe('environment validation (fail fast)', () => {
  it('lists every problem at once', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', JWT_SECRET: 'short', CORS_ORIGINS: 'not a url' })).toThrowError(EnvError);
    try {
      loadEnv({ NODE_ENV: 'test', JWT_SECRET: 'short', CORS_ORIGINS: 'http://x.test/' });
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toMatch(/DATABASE_URL/);
      expect(m).toMatch(/JWT_SECRET: must be at least 32/);
      expect(m).toMatch(/CORS_ORIGINS/);
    }
  });
  it('refuses the development secret in production', () => {
    expect(() => loadEnv({ ...baseEnv(), NODE_ENV: 'production', JWT_SECRET: 'dev-only-secret-change-me-dev-only-secret' })).toThrowError(/production/);
  });
  it('parses defaults', () => {
    const e = loadEnv(baseEnv());
    expect(e.PORT).toBe(4000);
    expect(e.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://crane.example.com']);
  });
});

describe('database resilience (Neon cold starts)', () => {
  it('adds pooler and pool defaults without overriding explicit values', () => {
    const u = new URL(withPoolDefaults('postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/db?sslmode=require'));
    expect(u.searchParams.get('pgbouncer')).toBe('true');
    expect(u.searchParams.get('connect_timeout')).toBe('15');
    expect(u.searchParams.get('sslmode')).toBe('require');
    const direct = new URL(withPoolDefaults('postgresql://u:p@ep-x.neon.tech/db?connection_limit=2'));
    expect(direct.searchParams.has('pgbouncer')).toBe(false);
    expect(direct.searchParams.get('connection_limit')).toBe('2');
  });
  it('retries transient connection errors only', async () => {
    let calls = 0;
    const transient = Object.assign(new Error("Can't reach database server"), { code: 'P1001' });
    const result = await retryTransient(async () => {
      if (++calls < 3) throw transient;
      return 'woke';
    }, 5, 1);
    expect(result).toBe('woke');
    expect(calls).toBe(3);
    let other = 0;
    await expect(retryTransient(async () => { other++; throw Object.assign(new Error('unique'), { code: 'P2002' }); }, 5, 1)).rejects.toThrow('unique');
    expect(other).toBe(1);
    expect(isTransient(transient)).toBe(true);
    expect(isTransient(new Error('x'))).toBe(false);
    await expect(retryTransient(async () => { throw transient; }, 2, 1)).rejects.toBe(transient);
  });
});

describe('auth', () => {
  it('registers, normalises the email and returns a session', async () => {
    const email = `Mixed.Case${++counter}@Example.com`;
    const r = await req().post(`${API}/auth/register`).send({ email: `  ${email}  `, password: 'long enough pw', displayName: '  Ada   L  ' });
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ email: email.toLowerCase(), displayName: 'Ada L' });
    expect(r.body.user.passwordHash).toBeUndefined();
    expect(typeof r.body.token).toBe('string');
    const stored = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored?.passwordHash).not.toContain('long enough');
  });

  it('rejects duplicate email (409), bad email, short/long password, unknown fields (400)', async () => {
    const { email } = await signUp();
    const dup = await req().post(`${API}/auth/register`).send({ email: email.toUpperCase(), password: 'another password' });
    expect(dup.status).toBe(409);
    expect(dup.body.errors[0].path).toBe('email');
    const cases: [Record<string, unknown>, string][] = [
      [{ email: 'nope', password: 'long enough pw' }, 'email'],
      [{ email: 'a@b.co', password: 'short' }, 'password'],
      [{ email: 'a@b.co', password: 'x'.repeat(73) }, 'password'],
      [{ email: 'a@b.co' }, 'password'],
      [{ email: 'a@b.co', password: 'long enough pw', isAdmin: true }, 'isAdmin'],
      [{ email: ['a@b.co'], password: 'long enough pw' }, 'email'],
    ];
    for (const [body, path] of cases) {
      const r = await req().post(`${API}/auth/register`).send(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body.errors.map((e: { path: string }) => e.path)).toContain(path);
    }
  });

  it('logs in and gives the same error for wrong password and unknown email', async () => {
    const { email } = await signUp();
    const ok = await req().post(`${API}/auth/login`).send({ email, password: 'correct horse battery' });
    expect(ok.status).toBe(200);
    const wrong = await req().post(`${API}/auth/login`).send({ email, password: 'wrong password!' });
    const unknown = await req().post(`${API}/auth/login`).send({ email: 'nobody@example.com', password: 'whatever it is' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.detail).toBe(unknown.body.detail);
    expect((await req().post(`${API}/auth/login`).send({ email })).status).toBe(400);
  });

  it('rate-limits login attempts (429) but not successful ones', async () => {
    const limited = createApp({ env: loadEnv(baseEnv()), db, limits: { ...DEFAULT_LIMITS, login: { windowMs: 60_000, max: 3 } } });
    const { email } = await signUp();
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await supertest(limited).post(`${API}/auth/login`).send({ email, password: 'wrong wrong wrong' })).status);
    expect(codes).toEqual([401, 401, 401, 429, 429]);
    const r = await supertest(limited).post(`${API}/auth/login`).send({ email, password: 'wrong wrong wrong' });
    expect(r.body.code).toBe('rate_limited');
  });

  it('/me requires a valid token', async () => {
    const u = await signUp();
    const ok = await req().get(`${API}/auth/me`).set(auth(u.token));
    expect(ok.status).toBe(200);
    expect(ok.body.user).toEqual({ id: u.id, email: u.email });
    expect((await req().get(`${API}/auth/me`)).status).toBe(401);
    expect((await req().get(`${API}/auth/me`).set('Authorization', 'Token abc')).status).toBe(401);
  });

  it('rejects tampered, expired, wrongly signed, alg:none and orphaned tokens', async () => {
    const u = await signUp();
    const get = (t: string) => req().get(`${API}/designs`).set(auth(t));

    const parts = u.token.split('.');
    const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: 'someone-else', email: 'x@y.z', exp: 9999999999 })).toString('base64url')}.${parts[2]}`;
    let r = await get(tampered);
    expect([r.status, r.body.code]).toEqual([401, 'token_invalid']);

    const expired = jwt.sign({ email: u.email }, SECRET, { subject: u.id, expiresIn: -10 });
    r = await get(expired);
    expect([r.status, r.body.code]).toEqual([401, 'token_expired']);

    const otherKey = jwt.sign({ email: u.email }, 'a-completely-different-secret-of-length-32+', { subject: u.id, expiresIn: '1h' });
    r = await get(otherKey);
    expect([r.status, r.body.code]).toEqual([401, 'token_invalid']);

    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: u.id, email: u.email })).toString('base64url')}.`;
    r = await get(none);
    expect([r.status, r.body.code]).toEqual([401, 'token_invalid']);

    const hs512 = jwt.sign({ email: u.email }, SECRET, { subject: u.id, algorithm: 'HS512' });
    expect((await get(hs512)).status).toBe(401);

    const ghost = jwt.sign({ email: 'ghost@example.com' }, SECRET, { subject: 'cl0000000000000000000000', expiresIn: '1h' });
    r = await get(ghost);
    expect([r.status, r.body.code]).toEqual([401, 'token_invalid']);

    expect((await get('garbage')).status).toBe(401);
  });
});

describe('designs: create and validate', () => {
  it('creates a design and returns warnings separately', async () => {
    const { token } = await signUp();
    const r = await newDesign(token, { inputs: { ...DEFAULT_INPUTS, capacityT: 2, spanM: 6 } });
    expect(r.status).toBe(201);
    expect(r.body.design).toMatchObject({ name: 'Test crane', revision: 1, schemaVersion: 1, capacityT: 2, spanM: 6, craneType: 'double-girder' });
    expect(r.body.warnings.map((w: { code: string }) => w.code).sort()).toEqual(['double_capacity_low', 'span_short']);
  });

  it('400 for malformed values, 422 for broken engineering rules, with field paths', async () => {
    const { token } = await signUp();
    const shape = await newDesign(token, { inputs: { ...DEFAULT_INPUTS, spanM: '18', capacityT: 7, dutyGroup: 99 } });
    expect(shape.status).toBe(400);
    expect(shape.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['inputs.capacityT', 'inputs.dutyGroup', 'inputs.spanM']);

    const rule = await newDesign(token, { inputs: { ...DEFAULT_INPUTS, craneType: 'single-girder', capacityT: 32 } });
    expect(rule.status).toBe(422);
    expect(rule.body).toMatchObject({ code: 'design_rules_violated', status: 422 });
    expect(rule.body.errors[0]).toMatchObject({ path: 'capacityT', severity: 'error', code: 'single_capacity_max' });
    expect(rule.body.errors[0].hint).toBeTruthy();
    expect(await db.design.count({ where: { name: 'Test crane', capacityT: 32 } })).toBe(0);
  });

  it('bypassing client validation: negative, zero, huge, null, arrays, missing and extra fields all fail', async () => {
    const { token } = await signUp();
    const bad: unknown[] = [
      { ...DEFAULT_INPUTS, spanM: -1 },
      { ...DEFAULT_INPUTS, spanM: 0 },
      { ...DEFAULT_INPUTS, spanM: 1e308 },
      { ...DEFAULT_INPUTS, spanM: null },
      { ...DEFAULT_INPUTS, liftHeightM: [9] },
      { ...DEFAULT_INPUTS, lowHeadroomHoist: 'false' },
      { ...DEFAULT_INPUTS, extra: 1 },
      { craneType: 'double-girder' },
      null,
      'inputs',
      [],
    ];
    for (const inputs of bad) {
      const r = await newDesign(token, { inputs });
      expect(r.status, JSON.stringify(inputs)).toBe(400);
    }
    expect((await newDesign(token, { userId: 'victim' })).status).toBe(400);
    expect((await newDesign(token, { revision: 9 })).status).toBe(400);
    expect((await newDesign(token, { name: '' })).status).toBe(400);
    expect((await newDesign(token, { name: '   ' })).status).toBe(400);
    expect((await newDesign(token, { name: 'x'.repeat(121) })).status).toBe(400);
    expect((await newDesign(token, { name: 42 })).status).toBe(400);
    expect((await newDesign(token, { notes: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('stores HTML/SQL in name and notes as inert text and strips control characters', async () => {
    const { token } = await signUp();
    const evil = `<img src=x onerror=alert(1)>'); DROP TABLE "Design"; --`;
    const r = await newDesign(token, { name: `  ${evil}\u0000\u200B  `, notes: `<script>alert(1)</script>\r\nline2\u0007` });
    expect(r.status).toBe(201);
    expect(r.body.design.name).toBe(evil);
    expect(r.body.design.notes).toBe('<script>alert(1)</script>\nline2');
    expect(await db.design.count()).toBeGreaterThan(0); // table still exists
    const list = await req().get(`${API}/designs`).query({ q: `'); DROP TABLE "Design"; --` }).set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(1);
  });

  it('cannot save a design under another user by passing a user id, and requires authentication', async () => {
    expect((await req().post(`${API}/designs`).send({ name: 'x', inputs: DEFAULT_INPUTS })).status).toBe(401);
    const a = await signUp();
    const b = await signUp();
    const created = await newDesign(a.token, { userId: b.id });
    expect(created.status).toBe(400);
  });
});

describe('designs: list, read, update, duplicate, delete', () => {
  it('lists only my designs with search, sort and pagination', async () => {
    const me = await signUp();
    const other = await signUp();
    await newDesign(other.token, { name: 'Other persons crane' });
    for (const [name, capacityT, spanM] of [['Alpha hall', 5, 12], ['Bravo shop', 20, 18], ['Charlie yard', 10, 30], ['Delta store', 2.5, 9]] as const) {
      expect((await newDesign(me.token, { name, notes: name === 'Bravo shop' ? 'has a keyword zinc' : '', inputs: { ...DEFAULT_INPUTS, capacityT, spanM } })).status).toBe(201);
    }
    const all = await req().get(`${API}/designs`).query({ sort: 'name', order: 'asc' }).set(auth(me.token));
    expect(all.body.total).toBe(4);
    expect(all.body.items.map((d: { name: string }) => d.name)).toEqual(['Alpha hall', 'Bravo shop', 'Charlie yard', 'Delta store']);
    expect(all.body.items[0].inputs).toMatchObject({ capacityT: 5 });

    const bySpan = await req().get(`${API}/designs`).query({ sort: 'spanM', order: 'desc', pageSize: 2, page: 2 }).set(auth(me.token));
    expect(bySpan.body.items.map((d: { spanM: number }) => d.spanM)).toEqual([12, 9]);
    expect(bySpan.body).toMatchObject({ page: 2, pageSize: 2, total: 4, totalPages: 2 });

    const search = await req().get(`${API}/designs`).query({ q: 'ZINC' }).set(auth(me.token));
    expect(search.body.items.map((d: { name: string }) => d.name)).toEqual(['Bravo shop']);
    expect((await req().get(`${API}/designs`).query({ q: 'persons' }).set(auth(me.token))).body.total).toBe(0);
  });

  it('rejects bad list queries', async () => {
    const { token } = await signUp();
    for (const q of [{ sort: 'inputs' }, { page: 0 }, { pageSize: 500 }, { order: 'sideways' }, { page: 'x' }, { surprise: 1 }]) {
      const r = await req().get(`${API}/designs`).query(q).set(auth(token));
      expect(r.status, JSON.stringify(q)).toBe(400);
    }
  });

  it('reads my design (with re-validation issues) and refuses others: 404 unknown, 403 foreign', async () => {
    const a = await signUp();
    const b = await signUp();
    const id = (await newDesign(a.token)).body.design.id as string;
    const mine = await req().get(`${API}/designs/${id}`).set(auth(a.token));
    expect(mine.status).toBe(200);
    expect(mine.body.design.id).toBe(id);
    expect(Array.isArray(mine.body.issues)).toBe(true);
    const foreign = await req().get(`${API}/designs/${id}`).set(auth(b.token));
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('forbidden');
    expect(JSON.stringify(foreign.body)).not.toContain('Test crane');
    expect((await req().get(`${API}/designs/cl0000000000000000000000`).set(auth(a.token))).status).toBe(404);
    expect((await req().get(`${API}/designs/${'x'.repeat(100)}`).set(auth(a.token))).status).toBe(404);
    expect((await req().get(`${API}/designs/${id}`)).status).toBe(401);
  });

  it('updates with optimistic concurrency and bumps the revision', async () => {
    const { token } = await signUp();
    const created = (await newDesign(token)).body.design;
    const inputs: CraneInputs = { ...DEFAULT_INPUTS, spanM: 24, capacityT: 16 };
    const upd = await req().put(`${API}/designs/${created.id}`).set(auth(token)).send({ name: 'Renamed', notes: 'new', inputs, revision: 1 });
    expect(upd.status).toBe(200);
    expect(upd.body.design).toMatchObject({ name: 'Renamed', revision: 2, spanM: 24, capacityT: 16 });
    expect(new Date(upd.body.design.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());

    const stale = await req().put(`${API}/designs/${created.id}`).set(auth(token)).send({ name: 'Stale write', notes: '', inputs, revision: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'revision_conflict', yourRevision: 1 });
    expect(stale.body.current).toMatchObject({ name: 'Renamed', revision: 2 });
    expect((await req().get(`${API}/designs/${created.id}`).set(auth(token))).body.design.name).toBe('Renamed');
  });

  it('validates updates (400 shape, 422 rules, 400 missing revision) without changing the row', async () => {
    const { token } = await signUp();
    const created = (await newDesign(token)).body.design;
    const put = (body: Record<string, unknown>) => req().put(`${API}/designs/${created.id}`).set(auth(token)).send(body);
    expect((await put({ name: 'x', inputs: DEFAULT_INPUTS })).status).toBe(400);
    expect((await put({ name: 'x', inputs: DEFAULT_INPUTS, revision: 0 })).status).toBe(400);
    expect((await put({ name: 'x', inputs: DEFAULT_INPUTS, revision: 1.5 })).status).toBe(400);
    expect((await put({ name: 'x', inputs: { ...DEFAULT_INPUTS, spanM: 99 }, revision: 1 })).status).toBe(400);
    expect((await put({ name: 'x', inputs: { ...DEFAULT_INPUTS, lowHeadroomHoist: true }, revision: 1 })).status).toBe(422);
    const row = await db.design.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.revision).toBe(1);
    expect(row.name).toBe('Test crane');
  });

  it("another user cannot update, duplicate, delete or export my design (403) and nothing changes", async () => {
    const a = await signUp();
    const b = await signUp();
    const id = (await newDesign(a.token)).body.design.id as string;
    const as = (m: 'put' | 'post' | 'delete' | 'get', path: string, body?: object) => req()[m](`${API}/designs/${id}${path}`).set(auth(b.token)).send(body);
    expect((await as('put', '', { name: 'hijack', inputs: DEFAULT_INPUTS, revision: 1 })).status).toBe(403);
    expect((await as('post', '/duplicate')).status).toBe(403);
    expect((await as('delete', '')).status).toBe(403);
    expect((await as('get', '/export/pdf')).status).toBe(403);
    const row = await db.design.findUniqueOrThrow({ where: { id } });
    expect([row.name, row.revision, row.userId]).toEqual(['Test crane', 1, a.id]);
  });

  it('two simultaneous edits from the same revision: exactly one wins, the other gets 409', async () => {
    const { token } = await signUp();
    const created = (await newDesign(token)).body.design;
    const send = (name: string) => req().put(`${API}/designs/${created.id}`).set(auth(token)).send({ name, notes: '', inputs: DEFAULT_INPUTS, revision: 1 });
    const results = await Promise.all([send('Editor A'), send('Editor B'), send('Editor C')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect((await db.design.findUniqueOrThrow({ where: { id: created.id } })).revision).toBe(2);
  });

  it('duplicates with a copied name and fresh revision, and truncates long names', async () => {
    const { token } = await signUp();
    const long = 'N'.repeat(120);
    const created = (await newDesign(token, { name: long })).body.design;
    const dup = await req().post(`${API}/designs/${created.id}/duplicate`).set(auth(token));
    expect(dup.status).toBe(201);
    expect(dup.body.design.id).not.toBe(created.id);
    expect(dup.body.design.name.length).toBe(120);
    expect(dup.body.design.name.startsWith('Copy of ')).toBe(true);
    expect(dup.body.design.revision).toBe(1);
    expect(dup.body.design.inputs).toEqual(created.inputs);
  });

  it('deletes my design (204, then 404)', async () => {
    const { token } = await signUp();
    const id = (await newDesign(token)).body.design.id as string;
    expect((await req().delete(`${API}/designs/${id}`).set(auth(token))).status).toBe(204);
    expect((await req().get(`${API}/designs/${id}`).set(auth(token))).status).toBe(404);
    expect((await req().delete(`${API}/designs/${id}`).set(auth(token))).status).toBe(404);
  });

  it('deleting a user cascades to their designs', async () => {
    const u = await signUp();
    await newDesign(u.token);
    await db.user.delete({ where: { id: u.id } });
    expect(await db.design.count({ where: { userId: u.id } })).toBe(0);
  });
});

describe('render and export', () => {
  it('POST /render returns derived dimensions and the drawing, without authentication', async () => {
    const r = await req().post(`${API}/render`).send({ inputs: PRESETS[2]!.inputs });
    expect(r.status).toBe(200);
    expect(r.body.valid).toBe(true);
    const keys = r.body.derived.dims.map((d: { key: string }) => d.key);
    expect(keys).toEqual(expect.arrayContaining(['span', 'girderDepth', 'wheelbase', 'headroom', 'hookApproach']));
    const span = r.body.derived.dims.find((d: { key: string }) => d.key === 'span');
    expect(span).toMatchObject({ value: 18000, status: 'input', unit: 'mm' });
    expect(r.body.derived.assumptions.length).toBeGreaterThan(3);
    expect(r.body.drawing.svg).toMatch(/^<svg/);
    expect(r.body.drawing.views).toHaveLength(3);
    expect(await db.design.count({ where: { name: 'Preview' } })).toBe(0);
  });

  it('POST /render: 400 for shape, 422 for rules, with paths', async () => {
    const a = await req().post(`${API}/render`).send({ inputs: { ...DEFAULT_INPUTS, spanM: '18' } });
    expect(a.status).toBe(400);
    expect(a.body.errors[0].path).toBe('inputs.spanM');
    const b = await req().post(`${API}/render`).send({ inputs: { ...DEFAULT_INPUTS, craneType: 'single-girder', capacityT: 32 } });
    expect(b.status).toBe(422);
    expect(b.body.errors[0].path).toBe('capacityT');
    expect((await req().post(`${API}/render`).send({ inputs: DEFAULT_INPUTS, extra: true })).status).toBe(400);
    expect((await req().post(`${API}/render`).send({})).status).toBe(400);
  });

  it('rate-limits the stateless endpoints', async () => {
    const limited = createApp({ env: loadEnv(baseEnv()), db, limits: { ...DEFAULT_LIMITS, heavy: { windowMs: 60_000, max: 2 } } });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await supertest(limited).post(`${API}/render`).send({ inputs: DEFAULT_INPUTS })).status);
    expect(codes).toEqual([200, 200, 429]);
  });

  it('exports SVG with escaped names, PDF with a PDF header, DXF that parses back', async () => {
    const post = (fmt: string, body: object) => req().post(`${API}/export/${fmt}`).send(body).buffer(true).parse(binary);
    const name = '<b>Hall</b> "A" & Ø';
    const svg = await post('svg', { inputs: DEFAULT_INPUTS, name, revision: 3 });
    expect(svg.status).toBe(200);
    expect(svg.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(svg.headers['content-disposition']).toMatch(/attachment; filename="bHallb-A-rev3\.svg"/);
    const svgText = (svg.body as Buffer).toString('utf8');
    expect(svgText).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svgText).not.toContain('<b>Hall');
    expect(svgText).toContain('&lt;b&gt;Hall&lt;/b&gt;');

    const pdf = await post('pdf', { inputs: DEFAULT_INPUTS, name, revision: 1 });
    expect(pdf.status).toBe(200);
    const pdfBuf = pdf.body as Buffer;
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdfBuf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfBuf.subarray(-8).toString()).toContain('%%EOF');
    expect(pdfBuf.length).toBeGreaterThan(5000);
    const mediaBox = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdfBuf.toString('latin1'));
    expect(Number(mediaBox?.[1])).toBeCloseTo(1190.55, 0); // A3 landscape in points
    expect(Number(mediaBox?.[2])).toBeCloseTo(841.89, 0);

    const dxf = await post('dxf', { inputs: DEFAULT_INPUTS, name: 'Parse me' });
    expect(dxf.status).toBe(200);
    const parsed = new DxfParser().parseSync((dxf.body as Buffer).toString('utf8'));
    expect(parsed?.entities.length).toBeGreaterThan(200);
  });

  it('export rejects unknown formats and invalid inputs', async () => {
    expect((await req().post(`${API}/export/png`).send({ inputs: DEFAULT_INPUTS })).status).toBe(400);
    expect((await req().post(`${API}/export/svg`).send({ inputs: { ...DEFAULT_INPUTS, spanM: 0 } })).status).toBe(400);
    expect((await req().post(`${API}/export/svg`).send({ inputs: { ...DEFAULT_INPUTS, craneType: 'single-girder', capacityT: 50 } })).status).toBe(422);
    expect((await req().post(`${API}/export/svg`).send({ inputs: DEFAULT_INPUTS, revision: -1 })).status).toBe(400);
  });

  it('exports a saved design with its revision and updated date in the title block', async () => {
    const { token } = await signUp();
    const created = (await newDesign(token, { name: 'Saved one' })).body.design;
    const r = await req().get(`${API}/designs/${created.id}/export/svg`).set(auth(token)).buffer(true).parse(binary);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('Saved-one-rev1.svg');
    expect((r.body as Buffer).toString('utf8')).toContain(created.updatedAt.slice(0, 10));
    expect((await req().get(`${API}/designs/${created.id}/export/bmp`).set(auth(token))).status).toBe(400);
  });
});
