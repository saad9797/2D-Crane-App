import { z } from 'zod';

const origin = z
  .string()
  .url()
  .refine((s) => !s.endsWith('/'), 'must not end with a slash');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'is required').regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  DIRECT_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string').optional(),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'must look like 15m, 12h or 7d').default('12h'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(origin).min(1, 'needs at least one origin')),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
});

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {}

/** Parse and validate the environment; throws one error listing every problem (fail fast at boot). */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const r = schema.safeParse(source);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new EnvError(`Invalid environment configuration:\n${lines.join('\n')}\nSee apps/api/.env.example.`);
  }
  if (r.data.NODE_ENV === 'production' && /^dev-only/.test(r.data.JWT_SECRET)) {
    throw new EnvError('Invalid environment configuration:\n  - JWT_SECRET: the development placeholder must not be used in production.');
  }
  return r.data;
}
