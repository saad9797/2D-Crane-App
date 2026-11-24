import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  NAME_MAX,
  SCHEMA_VERSION,
  analyze,
  cleanSingleLine,
  designCreateSchema,
  designUpdateSchema,
  listQuerySchema,
  type CraneInputs,
  type Issue,
} from '@crane/shared';
import type { Db } from '../db';
import { ApiError } from '../errors';
import { assertFormat, renderExport } from '../export';
import { asyncHandler } from '../http';
import { parse, requireValidDesign } from '../validate';

type Row = Awaited<ReturnType<Db['design']['findUniqueOrThrow']>>;

const dto = (d: Row) => ({
  id: d.id,
  name: d.name,
  notes: d.notes,
  craneType: d.craneType,
  capacityT: d.capacityT,
  spanM: d.spanM,
  inputs: d.inputs as unknown as CraneInputs,
  schemaVersion: d.schemaVersion,
  revision: d.revision,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
});

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export function designsRouter(db: Db): Router {
  const r = Router();

  const userId = (req: Request): string => {
    if (!req.user) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.');
    return req.user.id;
  };

  /** 404 when the id does not exist, 403 when it belongs to someone else (ids are unguessable cuids). */
  const loadOwned = async (req: Request): Promise<Row> => {
    const id = String(req.params.id ?? '');
    const design = id.length > 0 && id.length <= 40 ? await db.design.findUnique({ where: { id } }) : null;
    if (!design) throw new ApiError(404, 'not_found', 'That design does not exist.');
    if (design.userId !== userId(req)) throw new ApiError(403, 'forbidden', 'That design belongs to another account.');
    return design;
  };

  r.get(
    '/',
    asyncHandler(async (req, res) => {
      const q = parse(listQuerySchema, req.query);
      const search = q.q?.trim();
      const where: Prisma.DesignWhereInput = {
        userId: userId(req),
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { notes: { contains: search, mode: 'insensitive' } }] } : {}),
      };
      const [total, rows] = await Promise.all([
        db.design.count({ where }),
        db.design.findMany({
          where,
          orderBy: [{ [q.sort]: q.order }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);
      res.json({ items: rows.map(dto), page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) });
    }),
  );

  r.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = parse(designCreateSchema, req.body);
      const { analysis, warnings } = requireValidDesign(body.inputs);
      const created = await db.design.create({
        data: {
          userId: userId(req),
          name: body.name,
          notes: body.notes,
          craneType: analysis.inputs.craneType,
          capacityT: analysis.inputs.capacityT,
          spanM: analysis.inputs.spanM,
          inputs: analysis.inputs as unknown as Prisma.InputJsonValue,
          schemaVersion: SCHEMA_VERSION,
        },
      });
      res.status(201).json({ design: dto(created), warnings });
    }),
  );

  r.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const design = await loadOwned(req);
      // Re-validate on read: rules may have changed since the design was saved.
      const issues: Issue[] = analyze(design.inputs).issues;
      res.json({ design: dto(design), issues });
    }),
  );

  r.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const existing = await loadOwned(req);
      const body = parse(designUpdateSchema, req.body);
      const { analysis, warnings } = requireValidDesign(body.inputs);

      // Atomic compare-and-set on the revision the client last saw.
      const result = await db.design.updateMany({
        where: { id: existing.id, userId: existing.userId, revision: body.revision },
        data: {
          name: body.name,
          notes: body.notes,
          craneType: analysis.inputs.craneType,
          capacityT: analysis.inputs.capacityT,
          spanM: analysis.inputs.spanM,
          inputs: analysis.inputs as unknown as Prisma.InputJsonValue,
          schemaVersion: SCHEMA_VERSION,
          revision: { increment: 1 },
        },
      });
      if (result.count === 0) {
        const current = await db.design.findUnique({ where: { id: existing.id } });
        if (!current) throw new ApiError(404, 'not_found', 'That design was deleted.');
        throw new ApiError(
          409,
          'revision_conflict',
          'This design was changed somewhere else since you opened it.',
          undefined,
          { current: dto(current), yourRevision: body.revision },
        );
      }
      res.json({ design: dto(await db.design.findUniqueOrThrow({ where: { id: existing.id } })), warnings });
    }),
  );

  r.post(
    '/:id/duplicate',
    asyncHandler(async (req, res) => {
      const src = await loadOwned(req);
      const prefix = 'Copy of ';
      const name = cleanSingleLine(`${prefix}${src.name}`).slice(0, NAME_MAX);
      const copy = await db.design.create({
        data: {
          userId: src.userId,
          name,
          notes: src.notes,
          craneType: src.craneType,
          capacityT: src.capacityT,
          spanM: src.spanM,
          inputs: src.inputs as Prisma.InputJsonValue,
          schemaVersion: src.schemaVersion,
        },
      });
      res.status(201).json({ design: dto(copy), warnings: [] });
    }),
  );

  r.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const design = await loadOwned(req);
      await db.design.deleteMany({ where: { id: design.id, userId: design.userId } });
      res.status(204).end();
    }),
  );

  r.get(
    '/:id/export/:format',
    asyncHandler(async (req, res) => {
      const format = assertFormat(String(req.params.format));
      const design = await loadOwned(req);
      const { analysis } = requireValidDesign(design.inputs);
      const out = await renderExport(format, { model: analysis.model, name: design.name, revision: design.revision, date: isoDate(design.updatedAt) });
      res.setHeader('Content-Type', out.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.send(out.body);
    }),
  );

  return r;
}
