import type { ErrorRequestHandler, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { zodToIssues, type Issue } from '@crane/shared';

/** RFC 7807 problem details, with `errors` carrying per-field issues. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance: string;
  errors?: Issue[];
  [extra: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: Issue[],
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export function sendProblem(req: Request, res: Response, status: number, code: string, detail: string, issues?: Issue[], extra?: Record<string, unknown>): void {
  const body: Problem = {
    type: `/problems/${code}`,
    title: TITLES[status] ?? 'Error',
    status,
    code,
    detail,
    instance: req.originalUrl.split('?')[0] ?? req.originalUrl,
    ...(issues ? { errors: issues } : {}),
    ...(extra ?? {}),
  };
  res.status(status).type('application/problem+json').json(body);
}

/** Last middleware: every failure leaves as a problem document; nothing internal leaks. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) return sendProblem(req, res, err.status, err.code, err.message, err.issues, err.extra);
  if (err instanceof ZodError) return sendProblem(req, res, 400, 'validation_failed', 'The request is not valid.', zodToIssues(err));

  const type = (err as { type?: string }).type;
  if (type === 'entity.parse.failed') return sendProblem(req, res, 400, 'malformed_json', 'The request body is not valid JSON.');
  if (type === 'entity.too.large') return sendProblem(req, res, 413, 'payload_too_large', 'The request body is too large.');

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return sendProblem(req, res, 409, 'conflict', 'That record already exists.');
    if (err.code === 'P2025') return sendProblem(req, res, 404, 'not_found', 'The record does not exist.');
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    req.log?.error({ err }, 'database unavailable');
    return sendProblem(req, res, 503, 'database_unavailable', 'The database is not reachable right now. Try again in a moment.');
  }
  req.log?.error({ err }, 'unhandled error');
  return sendProblem(req, res, 500, 'internal_error', 'Something went wrong on the server.');
};
