import { Router, type RequestHandler } from 'express';
import { exportRequestSchema, renderRequestSchema, sceneToSvg } from '@crane/shared';
import { assertFormat, renderExport, sceneFor } from '../export';
import { asyncHandler } from '../http';
import { parse, requireValidDesign } from '../validate';

const today = (): string => new Date().toISOString().slice(0, 10);

/** Stateless endpoints: nothing is stored. Used for live validation, previews and exporting unsaved work. */
export function drawingRouter(limit: RequestHandler): Router {
  const r = Router();

  r.post(
    '/render',
    limit,
    asyncHandler(async (req, res) => {
      const { inputs } = parse(renderRequestSchema, req.body);
      const { analysis, warnings } = requireValidDesign(inputs);
      const scene = sceneFor({ model: analysis.model, name: 'Preview', revision: 1, date: today() });
      res.json({
        valid: true,
        warnings,
        derived: { dims: analysis.model.dims, assumptions: analysis.model.assumptions },
        drawing: { svg: sceneToSvg(scene), sheetScale: scene.sheetScale, views: scene.views },
      });
    }),
  );

  r.post(
    '/export/:format',
    limit,
    asyncHandler(async (req, res) => {
      const format = assertFormat(String(req.params.format));
      const body = parse(exportRequestSchema, req.body);
      const { analysis } = requireValidDesign(body.inputs);
      const out = await renderExport(format, { model: analysis.model, name: body.name, revision: body.revision, date: today() });
      res.setHeader('Content-Type', out.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.send(out.body);
    }),
  );

  return r;
}
