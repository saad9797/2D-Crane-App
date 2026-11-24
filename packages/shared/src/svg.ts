import type { Fill, Prim, Scene, LineStyle } from './scene';

/** Stroke widths in paper mm: 0.5 / 0.25 (1:2, ISO 128-2), frame 0.7. */
export const STROKE: Record<LineStyle, { w: number; dash?: string }> = {
  visible: { w: 0.5 },
  thin: { w: 0.25 },
  hidden: { w: 0.25, dash: '2 1' },
  centre: { w: 0.25, dash: '8 1.5 1.5 1.5' },
  ghost: { w: 0.25, dash: '1.5 1.5' },
  dim: { w: 0.25 },
  dimEst: { w: 0.25, dash: '2.4 0.8' },
  border: { w: 0.7 },
};

const FILL: Record<Fill, string> = { none: 'none', paper: '#ffffff', light: '#e8ecf1', solid: '#111111' };

export const escapeXml = (s: string): string =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] as string);

const n = (x: number): string => String(Math.round(x * 1000) / 1000);

const dataAttrs = (p: Prim): string =>
  `${p.part ? ` data-part="${p.part}"` : ''}${p.dimKey ? ` data-dim="${escapeXml(p.dimKey)}"` : ''}${p.view ? ` data-view="${p.view}"` : ''}`;

function attrs(p: Prim): string {
  const st = STROKE[p.style];
  const dash = st.dash ? ` stroke-dasharray="${st.dash}"` : '';
  const data = dataAttrs(p);
  return ` class="e ${p.style}" stroke-width="${st.w}"${dash}${data}`;
}

function primToSvg(p: Prim): string {
  switch (p.t) {
    case 'line':
      return `<line${attrs(p)} x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}"/>`;
    case 'rect':
      return `<rect${attrs(p)} x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="${FILL[p.fill]}"/>`;
    case 'circle':
      return `<circle${attrs(p)} cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${FILL[p.fill]}"/>`;
    case 'poly': {
      const pts = p.pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
      return p.closed
        ? `<polygon${attrs(p)} points="${pts}" fill="${FILL[p.fill]}"/>`
        : `<polyline${attrs(p)} points="${pts}" fill="none"/>`;
    }
    case 'text': {
      const anchor = p.anchor;
      const rot = p.rot ? ` transform="rotate(${-p.rot} ${n(p.x)} ${n(p.y)})"` : '';
      const data = dataAttrs(p);
      const style = `${p.bold ? ' font-weight="700"' : ''}${p.italic ? ' font-style="italic"' : ''}`;
      return `<text class="t" x="${n(p.x)}" y="${n(p.y)}" font-size="${n(p.size)}" text-anchor="${anchor}"${style}${rot}${data}>${escapeXml(p.text)}</text>`;
    }
  }
}

/**
 * Standalone SVG of the sheet (black on white). Also what the editor displays: `data-part` and
 * `data-dim` attributes let the UI highlight parts and link dimensions to the calculation table.
 * All text is escaped, so user-supplied names cannot inject markup.
 */
export function sceneToSvg(scene: Scene, opts: { standalone?: boolean } = {}): string {
  const xmlns = opts.standalone ? ' xmlns="http://www.w3.org/2000/svg"' : '';
  const body = scene.prims.map(primToSvg).join('\n');
  return (
    `<svg${xmlns} viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}mm" height="${scene.height}mm" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="${escapeXml(`General arrangement drawing: ${scene.title}`)}">` +
    `<title>${escapeXml(scene.title)}</title>` +
    `<style>.e{stroke:#111;fill:none;stroke-linecap:butt;stroke-linejoin:miter}.t{fill:#111}</style>` +
    `<rect width="${scene.width}" height="${scene.height}" fill="#ffffff"/>` +
    body +
    `</svg>`
  );
}
