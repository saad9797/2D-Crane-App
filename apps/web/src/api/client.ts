import type { CraneInputs, DimInfo, Issue, Assumption } from '@crane/shared';
import { useSyncExternalStore } from 'react';

const BASE = `${String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}/api/v1`;
const TOKEN_KEY = 'crane.token';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
}
export interface Session {
  token: string;
  expiresIn: string;
  user: User;
}
export interface Design {
  id: string;
  name: string;
  notes: string;
  craneType: string;
  capacityT: number;
  spanM: number;
  inputs: CraneInputs;
  schemaVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface DesignList {
  items: Design[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface DesignWithWarnings {
  design: Design;
  warnings: Issue[];
}
export interface ListParams {
  q?: string;
  sort: 'updatedAt' | 'createdAt' | 'name' | 'capacityT' | 'spanM';
  order: 'asc' | 'desc';
  page: number;
  pageSize: number;
}
export type ExportFormat = 'svg' | 'pdf' | 'dxf';

/** RFC 7807 problem returned by the API, or a network failure (status 0). */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: Issue[] = [],
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get isAuth(): boolean {
    return this.status === 401 && this.code !== 'invalid_credentials';
  }
}

// ---------- token storage (never throws: storage can be blocked) ----------
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(t: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* in-memory only */
    }
    memoryToken = t;
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    memoryToken = null;
  },
};
let memoryToken: string | null = null;
const currentToken = (): string | null => tokenStore.get() ?? memoryToken;

// ---------- cold-start ("waking up the server") ----------
interface WakeState {
  waking: boolean;
  attempt: number;
}
let wake: WakeState = { waking: false, attempt: 0 };
const wakeListeners = new Set<() => void>();
const setWake = (next: WakeState): void => {
  wake = next;
  wakeListeners.forEach((l) => l());
};
export const useWakeState = (): WakeState =>
  useSyncExternalStore(
    (l) => {
      wakeListeners.add(l);
      return () => wakeListeners.delete(l);
    },
    () => wake,
  );

let awake: Promise<void> | null = null;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Free-tier hosts sleep when idle. Ping /health until it answers, showing a friendly state if it takes a while. */
export function ensureAwake(): Promise<void> {
  if (awake) return awake;
  awake = (async () => {
    const started = Date.now();
    const timer = setTimeout(() => setWake({ waking: true, attempt: 0 }), 1500);
    try {
      for (let attempt = 1; attempt <= 40; attempt++) {
        try {
          const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(12_000) });
          if (r.ok) return;
        } catch {
          /* still asleep */
        }
        if (Date.now() - started > 1500) setWake({ waking: true, attempt });
        await sleep(Math.min(1000 + attempt * 500, 4000));
      }
      throw new ApiProblem(0, 'server_unreachable', 'The server did not wake up. Check your connection and retry.');
    } finally {
      clearTimeout(timer);
      setWake({ waking: false, attempt: 0 });
    }
  })().catch((e: unknown) => {
    awake = null; // allow a retry
    throw e;
  });
  return awake;
}

// ---------- requests ----------
let onAuthFailure: (code: string) => void = () => {};
export const setAuthFailureHandler = (fn: (code: string) => void): void => {
  onAuthFailure = fn;
};

async function toProblem(res: Response): Promise<ApiProblem> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  const issues = Array.isArray(body.errors) ? (body.errors as Issue[]) : [];
  const message = typeof body.detail === 'string' ? body.detail : `Request failed (${res.status}).`;
  return new ApiProblem(res.status, typeof body.code === 'string' ? body.code : 'http_error', message, issues, body);
}

async function send(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  await ensureAwake();
  const headers: Record<string, string> = {};
  const token = currentToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ?? null });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    awake = null; // server may have gone back to sleep
    throw new ApiProblem(0, 'network_error', 'Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    const problem = await toProblem(res);
    if (problem.isAuth && token) onAuthFailure(problem.code);
    throw problem;
  }
  return res;
}

async function json<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await send(method, path, body, signal);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface RenderResponse {
  valid: true;
  warnings: Issue[];
  derived: { dims: DimInfo[]; assumptions: Assumption[] };
  drawing: { svg: string; sheetScale: number };
}

export const api = {
  register: (email: string, password: string, displayName?: string) =>
    json<Session>('POST', '/auth/register', { email, password, ...(displayName ? { displayName } : {}) }),
  login: (email: string, password: string) => json<Session>('POST', '/auth/login', { email, password }),
  me: () => json<{ user: Pick<User, 'id' | 'email'> }>('GET', '/auth/me'),
  listDesigns: (p: ListParams, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ sort: p.sort, order: p.order, page: String(p.page), pageSize: String(p.pageSize) });
    if (p.q?.trim()) qs.set('q', p.q.trim());
    return json<DesignList>('GET', `/designs?${qs}`, undefined, signal);
  },
  getDesign: (id: string) => json<{ design: Design; issues: Issue[] }>('GET', `/designs/${encodeURIComponent(id)}`),
  createDesign: (body: { name: string; notes: string; inputs: CraneInputs }) => json<DesignWithWarnings>('POST', '/designs', body),
  updateDesign: (id: string, body: { name: string; notes: string; inputs: CraneInputs; revision: number }) =>
    json<DesignWithWarnings>('PUT', `/designs/${encodeURIComponent(id)}`, body),
  duplicateDesign: (id: string) => json<DesignWithWarnings>('POST', `/designs/${encodeURIComponent(id)}/duplicate`),
  deleteDesign: (id: string) => json<void>('DELETE', `/designs/${encodeURIComponent(id)}`),
  render: (inputs: CraneInputs) => json<RenderResponse>('POST', '/render', { inputs }),
  /** Exports exactly what is on screen (unsaved edits included) and returns a Blob. */
  exportFile: async (format: ExportFormat, body: { inputs: CraneInputs; name: string; revision: number }): Promise<Blob> =>
    (await send('POST', `/export/${format}`, body)).blob(),
};
