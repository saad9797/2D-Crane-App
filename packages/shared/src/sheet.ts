import { CRANE_TYPE_LABEL, DUTY_DESCRIPTION } from './constants';
import type { CraneModel } from './model';
import { translate, type Box, type Prim, type Scene, type TextPrim, type ViewId, type ViewInfo } from './scene';
import { buildEnd, buildFront, buildPlan, type ViewResult } from './views';

/**
 * Sheet composition: A3 landscape, ISO 5457-style frame (20 mm filing margin, 10 mm elsewhere),
 * title block bottom-right, first-angle layout. The sheet scale is the largest from the list below
 * at which front elevation + plan fit with room left for the end view.
 */

export const SHEET_W = 420;
export const SHEET_H = 297;
const FRAME = { x1: 20, y1: 10, x2: 410, y2: 287 };
const AREA = { x1: 24, y1: 14, x2: 406, y2: 235 };
/** Left of the title block the drawing area reaches lower, because the technical data is compact. */
const LEFT_BOTTOM = 252;
const TB = { x1: 232, y1: 239, x2: 410, y2: 287 };
const GAP = 8;

/** ISO 5455 preferred reductions plus a few intermediates so the sheet is used well. */
export const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000] as const;

export interface SheetMeta {
  name: string;
  revision: number;
  /** ISO date printed in the title block (an input so the engine stays deterministic). */
  date: string;
}

const w = (b: Box): number => b.x2 - b.x1;
const h = (b: Box): number => b.y2 - b.y1;

function shift(v: ViewResult, view: ViewId, dx: number, dy: number): ViewResult {
  return {
    prims: v.prims.map((p) => ({ ...translate(p, dx, dy), view })),
    box: { x1: v.box.x1 + dx, y1: v.box.y1 + dy, x2: v.box.x2 + dx, y2: v.box.y2 + dy },
  };
}

interface Chosen {
  main: number;
  end: number;
  front: ViewResult;
  plan: ViewResult;
  endView: ViewResult;
}

export function chooseScales(m: CraneModel): Chosen {
  const availW = AREA.x2 - AREA.x1;
  const availH = AREA.y2 - AREA.y1;
  for (const N of SCALES) {
    const front = buildFront(m, N);
    const plan = buildPlan(m, N);
    const left = Math.max(w(front.box), w(plan.box));
    const limit = AREA.x1 + left > TB.x1 - 4 ? AREA.y2 : LEFT_BOTTOM;
    if (h(front.box) + GAP + h(plan.box) > limit - AREA.y1 || left > availW) continue;
    for (const Ne of SCALES.filter((s) => s <= N)) {
      const endView = buildEnd(m, Ne);
      if (w(endView.box) <= availW - left - GAP && h(endView.box) <= availH) return { main: N, end: Ne, front, plan, endView };
    }
  }
  const N = SCALES[SCALES.length - 1]!;
  return { main: N, end: N, front: buildFront(m, N), plan: buildPlan(m, N), endView: buildEnd(m, N) };
}

const text = (x: number, y: number, s: string, size: number, o: Partial<TextPrim> = {}): Prim => ({
  t: 'text', x, y, text: s, size, anchor: 'start', style: 'dim', layer: 'TEXT', ...o,
});
const line = (x1: number, y1: number, x2: number, y2: number): Prim => ({
  t: 'line', x1, y1, x2, y2, style: 'thin', layer: 'BORDER',
});

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const dimOf = (m: CraneModel, key: string) => m.dims.find((d) => d.key === key);
const star = (m: CraneModel, key: string): string => (dimOf(m, key)?.status === 'estimate' ? '*' : '');

function titleBlock(m: CraneModel, meta: SheetMeta, scale: number): Prim[] {
  const p: Prim[] = [];
  p.push({ t: 'rect', x: TB.x1, y: TB.y1, w: TB.x2 - TB.x1, h: TB.y2 - TB.y1, fill: 'none', style: 'visible', layer: 'BORDER' });
  for (const y of [250, 262, 276]) p.push(line(TB.x1, y, TB.x2, y));
  p.push(text(TB.x1 + 3, 247.5, 'OVERHEAD CRANE · GENERAL ARRANGEMENT', 4.2, { bold: true }));
  p.push(text(TB.x1 + 3, 256, clip(meta.name, 56), 3.6, { bold: true }));
  p.push(text(TB.x1 + 3, 260.6, `${CRANE_TYPE_LABEL[m.type]} · ${m.capacityT} t · span ${m.spanMm / 1000} m · duty A${m.inputs.dutyGroup}`, 2.6));
  const cells: [string, string][] = [
    ['SCALE', `1:${scale}`],
    ['DATE', meta.date || 'n/a'],
    ['REVISION', String(meta.revision)],
    ['UNITS', 'mm · 1st angle'],
  ];
  const cw = (TB.x2 - TB.x1) / cells.length;
  cells.forEach(([label, value], i) => {
    const x = TB.x1 + i * cw;
    if (i > 0) p.push(line(x, 262, x, 276));
    p.push(text(x + 2, 265.5, label, 2.2));
    p.push(text(x + 2, 273, value, 3.4, { bold: true }));
  });
  p.push(text(TB.x1 + 3, 281.5, 'GENERATED DRAWING · NOT FOR FABRICATION', 3.2, { bold: true }));
  p.push(text(TB.x1 + 3, 285.3, '* = ESTIMATED VALUE (dashed dimension, italic). See the Calculated dimensions table.', 2.2));
  return p;
}

function technicalData(m: CraneModel): Prim[] {
  const p: Prim[] = [];
  const x0 = 24;
  const y0 = 257;
  p.push(text(x0, y0, 'TECHNICAL DATA', 3.4, { bold: true }));
  p.push(line(x0, y0 + 1.6, 226, y0 + 1.6));
  const left: [string, string][] = [
    ['Rated capacity', `${m.capacityT} t`],
    ['Span', `${m.spanMm / 1000} m`],
    ['Lift height', `${m.liftMm / 1000} m`],
    ['Duty group (FEM/ISO)', `A${m.inputs.dutyGroup} ${DUTY_DESCRIPTION[m.inputs.dutyGroup] ?? ''}`.slice(0, 40)],
    ['Girder depth x width', `${m.girderDepth} x ${m.girderWidth} mm${star(m, 'girderDepth')}`],
  ];
  const right: [string, string][] = [
    ['Rail', `DIN 536 ${m.rail.section}${star(m, 'railHead')}`],
    ['Wheels', `${m.wheelsPerEnd * 2} x Ø${m.wheelDia}${star(m, 'wheelDia')}`],
    ['Max static wheel load', `${dimOf(m, 'wheelLoad')?.value ?? '-'} kN*`],
    ['Crane mass (approx.)', `${dimOf(m, 'craneMass')?.value ?? '-'} t*`],
    ['Rail height above floor, min.', `${m.minRailHeightAboveFloor} mm${star(m, 'minRailHeight')}`],
  ];
  left.forEach(([k, v], i) => {
    p.push(text(x0, y0 + 6.5 + i * 4.2, k, 2.6));
    p.push(text(x0 + 38, y0 + 6.5 + i * 4.2, v, 2.6, { bold: true }));
  });
  right.forEach(([k, v], i) => {
    p.push(text(x0 + 104, y0 + 6.5 + i * 4.2, k, 2.6));
    p.push(text(x0 + 104 + 44, y0 + 6.5 + i * 4.2, v, 2.6, { bold: true }));
  });
  p.push(text(x0, 285.5, 'Component outlines are schematic. Dimensions are model values, not a structural design.', 2.2));
  return p;
}

export function buildScene(m: CraneModel, meta: SheetMeta): Scene {
  const { main, end, front, plan, endView } = chooseScales(m);
  const prims: Prim[] = [];
  prims.push({ t: 'rect', x: 0, y: 0, w: SHEET_W, h: SHEET_H, fill: 'none', style: 'thin', layer: 'BORDER' });
  prims.push({ t: 'rect', x: FRAME.x1, y: FRAME.y1, w: FRAME.x2 - FRAME.x1, h: FRAME.y2 - FRAME.y1, fill: 'none', style: 'border', layer: 'BORDER' });

  // front and plan share the x origin so they stay aligned (first-angle projection)
  const dx = AREA.x1 - Math.min(front.box.x1, plan.box.x1);
  const f = shift(front, 'front', dx, AREA.y1 - front.box.y1);
  const pl = shift(plan, 'plan', dx, f.box.y2 + GAP - plan.box.y1);
  // equal scales: keep the rail datum level with the front elevation
  const eDy = end === main ? AREA.y1 - front.box.y1 : AREA.y1 - endView.box.y1;
  const en = shift(endView, 'end', AREA.x2 - endView.box.x2, eDy);
  const views: ViewInfo[] = [
    { id: 'front', title: 'FRONT ELEVATION', scale: main, box: f.box },
    { id: 'plan', title: 'PLAN', scale: main, box: pl.box },
    { id: 'end', title: 'VIEW FROM LEFT', scale: end, box: en.box },
  ];
  prims.push(...f.prims, ...pl.prims, ...en.prims, ...technicalData(m), ...titleBlock(m, meta, main));
  return { width: SHEET_W, height: SHEET_H, prims, views, sheetScale: main, title: meta.name };
}
