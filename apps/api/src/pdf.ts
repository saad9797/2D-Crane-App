import PDFDocument from 'pdfkit';
import { STROKE, type Fill, type Scene, type TextPrim } from '@crane/shared';

const PT = 72 / 25.4;
const FILL: Record<Fill, string | null> = { none: null, paper: '#ffffff', light: '#e8ecf1', solid: '#111111' };

/** Built-in PDF fonts are WinAnsi: keep Latin-1 plus the ellipsis used on the sheet. */
const winAnsi = (s: string): string => s.replace(/[^\u0020-\u007E\u00A0-\u00FF\u2026]/g, '?');

function drawText(doc: PDFKit.PDFDocument, p: TextPrim): void {
  doc.font(p.bold ? 'Helvetica-Bold' : p.italic ? 'Helvetica-Oblique' : 'Helvetica').fontSize(p.size * PT);
  const str = winAnsi(p.text);
  const w = doc.widthOfString(str);
  const ascent = doc.currentLineHeight(false) * 0.8;
  const x = p.x * PT - (p.anchor === 'middle' ? w / 2 : p.anchor === 'end' ? w : 0);
  const y = p.y * PT - ascent;
  doc.save();
  if (p.rot) doc.rotate(-p.rot, { origin: [p.x * PT, p.y * PT] });
  doc.fillColor('#111111').text(str, x, y, { lineBreak: false });
  doc.restore();
}

/** Vector A3-landscape PDF of the sheet, drawn from the same primitives as the SVG and DXF. */
export function sceneToPdf(scene: Scene, meta: { title: string; subject: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [scene.width * PT, scene.height * PT],
      margin: 0,
      info: { Title: winAnsi(meta.title), Subject: winAnsi(meta.subject), Creator: 'Crane GA generator', Producer: 'Crane GA generator' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (const p of scene.prims) {
      if (p.t === 'text') {
        drawText(doc, p);
        continue;
      }
      const st = STROKE[p.style];
      doc.lineWidth(st.w * PT).strokeColor('#111111');
      if (st.dash) {
        const [a = 2, b = a] = st.dash.split(' ').map((d) => Number(d) * PT);
        doc.dash(a, { space: b });
      } else {
        doc.undash();
      }
      if (p.t === 'line') {
        doc.moveTo(p.x1 * PT, p.y1 * PT).lineTo(p.x2 * PT, p.y2 * PT).stroke();
        continue;
      }
      if (p.t === 'rect') doc.rect(p.x * PT, p.y * PT, p.w * PT, p.h * PT);
      else if (p.t === 'circle') doc.circle(p.cx * PT, p.cy * PT, p.r * PT);
      else {
        p.pts.forEach(([x, y], i) => (i === 0 ? doc.moveTo(x * PT, y * PT) : doc.lineTo(x * PT, y * PT)));
        if (p.closed) doc.closePath();
      }
      const fill = FILL[p.fill];
      if (fill) doc.fillAndStroke(fill, '#111111');
      else doc.stroke();
    }
    doc.end();
  });
}
