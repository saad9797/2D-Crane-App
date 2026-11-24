import { buildScene, sceneToDxf, sceneToSvg, type CraneModel, type Scene } from '@crane/shared';
import { ApiError } from './errors';
import { slug } from './http';
import { sceneToPdf } from './pdf';

export const EXPORT_FORMATS = ['svg', 'pdf', 'dxf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function assertFormat(f: string): ExportFormat {
  if ((EXPORT_FORMATS as readonly string[]).includes(f)) return f as ExportFormat;
  throw new ApiError(400, 'unsupported_format', `Export format "${f.slice(0, 20)}" is not supported. Use svg, pdf or dxf. PNG is produced in the browser.`);
}

export interface SheetRequest {
  model: CraneModel;
  name: string;
  revision: number;
  /** ISO date (YYYY-MM-DD) printed in the title block. */
  date: string;
}

export const sceneFor = ({ model, name, revision, date }: SheetRequest): Scene => buildScene(model, { name, revision, date });

export async function renderExport(format: ExportFormat, req: SheetRequest): Promise<{ contentType: string; body: Buffer | string; filename: string }> {
  const scene = sceneFor(req);
  const base = `${slug(req.name)}-rev${req.revision}`;
  switch (format) {
    case 'svg':
      return { contentType: 'image/svg+xml; charset=utf-8', body: sceneToSvg(scene, { standalone: true }), filename: `${base}.svg` };
    case 'dxf':
      return { contentType: 'application/dxf', body: sceneToDxf(scene), filename: `${base}.dxf` };
    case 'pdf':
      return {
        contentType: 'application/pdf',
        body: await sceneToPdf(scene, { title: `${req.name} (rev ${req.revision})`, subject: 'Overhead crane general arrangement. Generated drawing, not for fabrication.' }),
        filename: `${base}.pdf`,
      };
  }
}
