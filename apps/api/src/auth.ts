import bcrypt from 'bcryptjs';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { loginSchema, registerSchema } from '@crane/shared';
import type { Db } from './db';
import type { Env } from './env';
import { ApiError } from './errors';
import { asyncHandler } from './http';
import { parse } from './validate';

interface TokenPayload {
  sub: string;
  email: string;
}

type PublicUser = { id: string; email: string; displayName: string | null };
const publicUser = (u: PublicUser): PublicUser => ({ id: u.id, email: u.email, displayName: u.displayName });

export function createAuth(env: Env, db: Db) {
  // Compared against when the email is unknown so login timing does not reveal which emails exist.
  const dummyHash = bcrypt.hashSync('not-a-real-password', env.BCRYPT_COST);

  const sign = (user: { id: string; email: string }): string =>
    jwt.sign({ email: user.email }, env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: user.id,
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

  const session = (user: PublicUser) => ({ token: sign(user), expiresIn: env.JWT_EXPIRES_IN, user: publicUser(user) });

  /** Verifies the bearer token (HS256 only, so `alg: none` tokens are refused) and loads the user. */
  const requireAuth: RequestHandler = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.');
    let payload: TokenPayload;
    try {
      payload = jwt.verify(header.slice(7), env.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
    } catch (e) {
      if (e instanceof jwt.TokenExpiredError) throw new ApiError(401, 'token_expired', 'Your session has expired. Sign in again.');
      throw new ApiError(401, 'token_invalid', 'The session token is not valid. Sign in again.');
    }
    if (typeof payload.sub !== 'string') throw new ApiError(401, 'token_invalid', 'The session token is not valid. Sign in again.');
    const user = await db.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true } });
    if (!user) throw new ApiError(401, 'token_invalid', 'This account no longer exists. Sign in again.');
    req.user = user;
    next();
  });

  const router = (limits: { login: RequestHandler; register: RequestHandler }): Router => {
    const r = Router();

    r.post(
      '/register',
      limits.register,
      asyncHandler(async (req, res) => {
        const body = parse(registerSchema, req.body);
        const existing = await db.user.findUnique({ where: { email: body.email }, select: { id: true } });
        if (existing) {
          throw new ApiError(409, 'email_taken', 'An account with this email already exists.', [
            { path: 'email', severity: 'error', code: 'email_taken', message: 'An account with this email already exists.', hint: 'Sign in instead.' },
          ]);
        }
        const user = await db.user.create({
          data: { email: body.email, passwordHash: await bcrypt.hash(body.password, env.BCRYPT_COST), displayName: body.displayName || null },
        });
        res.status(201).json(session(user));
      }),
    );

    r.post(
      '/login',
      limits.login,
      asyncHandler(async (req, res) => {
        const body = parse(loginSchema, req.body);
        const user = await db.user.findUnique({ where: { email: body.email } });
        const ok = await bcrypt.compare(body.password, user?.passwordHash ?? dummyHash);
        if (!user || !ok) throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
        res.json(session(user));
      }),
    );

    r.get('/me', requireAuth, (req, res) => {
      res.json({ user: req.user });
    });

    return r;
  };

  return { router, requireAuth };
}
