import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { createAuth } from './auth';
import type { Db } from './db';
import type { Env } from './env';
import { errorHandler, sendProblem } from './errors';
import { designsRouter } from './routes/designs';
import { drawingRouter } from './routes/drawing';
import { logger } from './logger';

export interface RateLimits {
  login: { windowMs: number; max: number };
  register: { windowMs: number; max: number };
  heavy: { windowMs: number; max: number };
}

export const DEFAULT_LIMITS: RateLimits = {
  login: { windowMs: 15 * 60_000, max: 10 },
  register: { windowMs: 60 * 60_000, max: 20 },
  heavy: { windowMs: 60_000, max: 60 },
};

const API = '/api/v1';

export function createApp(opts: { env: Env; db: Db; limits?: RateLimits }): Express {
  const { env, db } = opts;
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  const limiter = (cfg: { windowMs: number; max: number }, skipSuccess = false): RequestHandler =>
    rateLimit({
      windowMs: cfg.windowMs,
      limit: cfg.max,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skipSuccessfulRequests: skipSuccess,
      handler: (req, res) => sendProblem(req, res, 429, 'rate_limited', 'Too many requests. Wait a moment and try again.'),
    });

  app.use(
    pinoHttp({
      logger: logger(env.LOG_LEVEL),
      genReqId: (req, res) => {
        const id = String(req.headers['x-request-id'] ?? randomUUID()).slice(0, 64);
        res.setHeader('X-Request-Id', id);
        return id;
      },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      autoLogging: { ignore: (req) => req.url === `${API}/health` },
    }),
  );
  app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] } } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb', strict: true }));

  const auth = createAuth(env, db);

  app.get(`${API}/health`, async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'up', uptime: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use(`${API}/auth`, auth.router({ login: limiter(limits.login, true), register: limiter(limits.register) }));
  app.use(API, drawingRouter(limiter(limits.heavy)));
  app.use(`${API}/designs`, auth.requireAuth, designsRouter(db));

  app.use((req, res) => sendProblem(req, res, 404, 'route_not_found', 'There is no such endpoint.'));
  app.use(errorHandler);
  return app;
}
