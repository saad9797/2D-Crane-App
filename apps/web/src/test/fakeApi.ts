import { analyze } from '@crane/shared';
import type { Design } from '../api/client';

/**
 * Minimal in-memory stand-in for the API, installed over global fetch in tests. It enforces the same
 * rules as the real server by reusing the shared engine, and implements revision conflicts.
 */
export interface FakeApi {
  designs: Map<string, Design>;
  calls: { method: string; path: string; body: unknown }[];
  /** Force the next PUT to answer 409 with this design as the current version. */
  conflictNext: Design | null;
  install: () => void;
}

export function createFakeApi(seed: Design[] = []): FakeApi {
  const designs = new Map(seed.map((d) => [d.id, d]));
  let counter = 0;
  const calls: FakeApi['calls'] = [];
  const api: FakeApi = { designs, calls, conflictNext: null, install: () => {} };

  const respond = (status: number, body?: unknown): Response =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' } });

  const problem = (status: number, code: string, detail: string, errors?: unknown, extra: object = {}): Response =>
    respond(status, { status, code, detail, ...(errors ? { errors } : {}), ...extra });

  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'http://api.test');
    const path = url.pathname.replace('/api/v1', '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path !== '/health') calls.push({ method, path, body });

    if (path === '/health') return respond(200, { status: 'ok' });
    if (path === '/auth/me') return respond(200, { user: { id: 'u1', email: 'tester@example.com' } });

    if (path === '/designs' && method === 'POST') {
      const a = analyze(body.inputs);
      if (!a.ok || !a.inputs) return problem(422, 'design_rules_violated', 'These inputs break an engineering rule.', a.issues);
      counter += 1;
      const now = new Date().toISOString();
      const d: Design = {
        id: `d${counter}`, name: body.name, notes: body.notes ?? '', craneType: a.inputs.craneType, capacityT: a.inputs.capacityT, spanM: a.inputs.spanM,
        inputs: a.inputs, schemaVersion: 1, revision: 1, createdAt: now, updatedAt: now,
      };
      designs.set(d.id, d);
      return respond(201, { design: d, warnings: a.issues.filter((i) => i.severity === 'warning') });
    }

    const m = /^\/designs\/([^/]+)$/.exec(path);
    if (m) {
      const id = decodeURIComponent(m[1] as string);
      const existing = designs.get(id);
      if (!existing) return problem(404, 'not_found', 'That design does not exist.');
      if (method === 'GET') return respond(200, { design: existing, issues: analyze(existing.inputs).issues });
      if (method === 'PUT') {
        if (api.conflictNext) {
          const current = api.conflictNext;
          api.conflictNext = null;
          designs.set(id, current);
          return problem(409, 'revision_conflict', 'This design was changed somewhere else since you opened it.', undefined, { current, yourRevision: body.revision });
        }
        if (body.revision !== existing.revision) return problem(409, 'revision_conflict', 'Changed elsewhere.', undefined, { current: existing, yourRevision: body.revision });
        const a = analyze(body.inputs);
        if (!a.ok || !a.inputs) return problem(422, 'design_rules_violated', 'These inputs break an engineering rule.', a.issues);
        const updated: Design = { ...existing, name: body.name, notes: body.notes ?? '', inputs: a.inputs, craneType: a.inputs.craneType, capacityT: a.inputs.capacityT, spanM: a.inputs.spanM, revision: existing.revision + 1, updatedAt: new Date().toISOString() };
        designs.set(id, updated);
        return respond(200, { design: updated, warnings: [] });
      }
      if (method === 'DELETE') {
        designs.delete(id);
        return respond(204);
      }
    }
    return problem(404, 'route_not_found', `No fake route for ${method} ${path}`);
  };

  api.install = () => {
    globalThis.fetch = handler as typeof fetch;
  };
  return api;
}
