import type { Prim, Scene } from './scene';

/**
 * ASCII DXF, AutoCAD R12 (AC1009): LINE, CIRCLE and TEXT only, so any CAD package opens it.
 * Rectangles and polygons are written as LINE segments; arrowheads as three lines.
 * Units: millimetres on the A3 sheet as plotted (so it is at the sheet scale printed in the
 * title block); y is flipped to the CAD convention (up).
 */

interface LayerDef {
  colour: number;
  linetype: 'CONTINUOUS' | 'DASHED' | 'CENTER' | 'HIDDEN';
}

export const DXF_LAYERS: Record<string, LayerDef> = {
  OUTLINE: { colour: 7, linetype: 'CONTINUOUS' },
  THIN: { colour: 8, linetype: 'CONTINUOUS' },
  HIDDEN: { colour: 8, linetype: 'HIDDEN' },
  CENTRE: { colour: 1, linetype: 'CENTER' },
  GHOST: { colour: 8, linetype: 'DASHED' },
  DIM: { colour: 3, linetype: 'CONTINUOUS' },
  DIM_EST: { colour: 30, linetype: 'DASHED' },
  TEXT: { colour: 7, linetype: 'CONTINUOUS' },
  BORDER: { colour: 7, linetype: 'CONTINUOUS' },
};

const LTYPES: { name: string; desc: string; pattern: number[] }[] = [
  { name: 'CONTINUOUS', desc: 'Solid line', pattern: [] },
  { name: 'DASHED', desc: 'Dashed', pattern: [3, -1.5] },
  { name: 'HIDDEN', desc: 'Hidden', pattern: [2, -1] },
  { name: 'CENTER', desc: 'Center', pattern: [8, -1.5, 1.5, -1.5] },
];

/** R12 text is single-byte: map the few non-ASCII symbols used on the sheet. */
export function dxfText(s: string): string {
  return s
    .replace(/Ø/g, '%%c')
    .replace(/[·•]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '?');
}

type Pair = [number, string | number];

export function sceneToDxf(scene: Scene): string {
  const out: string[] = [];
  const g = (code: number, value: string | number): void => {
    out.push(String(code), String(value));
  };
  const fy = (y: number): number => Math.round((scene.height - y) * 1000) / 1000;
  const fx = (x: number): number => Math.round(x * 1000) / 1000;

  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LTYPE');
  g(70, LTYPES.length);
  for (const lt of LTYPES) {
    g(0, 'LTYPE');
    g(2, lt.name);
    g(70, 0);
    g(3, lt.desc);
    g(72, 65);
    g(73, lt.pattern.length);
    g(40, lt.pattern.reduce((a, b) => a + Math.abs(b), 0));
    for (const d of lt.pattern) g(49, d);
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, Object.keys(DXF_LAYERS).length);
  for (const [name, def] of Object.entries(DXF_LAYERS)) {
    g(0, 'LAYER');
    g(2, name);
    g(70, 0);
    g(62, def.colour);
    g(6, def.linetype);
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'ENTITIES');

  const lineE = (layer: string, x1: number, y1: number, x2: number, y2: number): void => {
    const pairs: Pair[] = [[8, layer], [10, fx(x1)], [20, fy(y1)], [30, 0], [11, fx(x2)], [21, fy(y2)], [31, 0]];
    g(0, 'LINE');
    for (const [c, v] of pairs) g(c, v);
  };
  const polyE = (layer: string, pts: [number, number][], closed: boolean): void => {
    const last = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      lineE(layer, a[0], a[1], b[0], b[1]);
    }
  };

  const emit = (p: Prim): void => {
    const layer = p.layer in DXF_LAYERS ? p.layer : 'OUTLINE';
    switch (p.t) {
      case 'line':
        lineE(layer, p.x1, p.y1, p.x2, p.y2);
        break;
      case 'rect':
        polyE(layer, [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]], true);
        break;
      case 'circle':
        g(0, 'CIRCLE');
        g(8, layer);
        g(10, fx(p.cx));
        g(20, fy(p.cy));
        g(30, 0);
        g(40, fx(p.r));
        break;
      case 'poly':
        polyE(layer, p.pts, p.closed);
        break;
      case 'text': {
        const halign = p.anchor === 'start' ? 0 : p.anchor === 'middle' ? 1 : 2;
        g(0, 'TEXT');
        g(8, layer);
        g(10, fx(p.x));
        g(20, fy(p.y));
        g(30, 0);
        g(40, Math.round(p.size * 0.72 * 100) / 100);
        g(1, dxfText(p.text));
        if (p.rot) g(50, p.rot);
        if (p.italic) g(51, 15);
        if (halign !== 0) {
          g(72, halign);
          g(11, fx(p.x));
          g(21, fy(p.y));
          g(31, 0);
        }
        break;
      }
    }
  };
  scene.prims.forEach(emit);

  g(0, 'ENDSEC');
  g(0, 'EOF');
  return `${out.join('\r\n')}\r\n`;
}

