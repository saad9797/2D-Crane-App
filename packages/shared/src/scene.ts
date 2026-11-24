import type { PartId } from './model';

/**
 * Drawing primitives in sheet coordinates: millimetres on paper, origin top-left, y down.
 * The scene is the single source of truth for every renderer (React SVG, SVG file, PDF, DXF).
 */

export type LineStyle = 'visible' | 'thin' | 'hidden' | 'centre' | 'dim' | 'dimEst' | 'border' | 'ghost';
export type Fill = 'none' | 'paper' | 'light' | 'solid';

interface Base {
  /** DXF layer. */
  layer: string;
  style: LineStyle;
  /** Part this primitive belongs to (hover highlight). */
  part?: PartId;
  /** Key of the dimension (DimInfo.key) a dimension primitive belongs to. */
  dimKey?: string;
  /** Which view of the sheet the primitive belongs to (set when the sheet is composed). */
  view?: ViewId;
}

export type ViewId = 'front' | 'end' | 'plan';

export interface LinePrim extends Base { t: 'line'; x1: number; y1: number; x2: number; y2: number }
export interface RectPrim extends Base { t: 'rect'; x: number; y: number; w: number; h: number; fill: Fill }
export interface CirclePrim extends Base { t: 'circle'; cx: number; cy: number; r: number; fill: Fill }
export interface PolyPrim extends Base { t: 'poly'; pts: [number, number][]; closed: boolean; fill: Fill }
export interface TextPrim extends Base {
  t: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
  anchor: 'start' | 'middle' | 'end';
  /** Rotation in degrees, counter-clockwise on paper (90 reads bottom-to-top). */
  rot?: number;
  bold?: boolean;
  italic?: boolean;
  /** Marks estimated values so renderers can add the legend marker. */
  est?: boolean;
}

export type Prim = LinePrim | RectPrim | CirclePrim | PolyPrim | TextPrim;

export interface Box { x1: number; y1: number; x2: number; y2: number }

export interface ViewInfo {
  id: ViewId;
  title: string;
  /** Scale denominator (1:N). */
  scale: number;
  box: Box;
}

export interface Scene {
  width: number;
  height: number;
  prims: Prim[];
  views: ViewInfo[];
  /** Sheet scale denominator used for the front elevation and plan. */
  sheetScale: number;
  title: string;
}

/** Approximate text width in paper mm (Arial-like average advance ≈ 0.58 em, bold wider). */
export function textWidth(text: string, size: number, bold = false): number {
  return text.length * size * (bold ? 0.64 : 0.58);
}

/** Axis-aligned box of a text primitive (0° and 90° rotations; 90° reads bottom-to-top). */
export function textBox(p: TextPrim): Box {
  const w = textWidth(p.text, p.size, p.bold);
  const h = p.size;
  if ((p.rot ?? 0) === 90) {
    // baseline is vertical at x; glyphs extend to the left; the anchor is along y
    const top = p.anchor === 'middle' ? p.y - w / 2 : p.anchor === 'start' ? p.y - w : p.y;
    return { x1: p.x - h, y1: top, x2: p.x, y2: top + w };
  }
  const left = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'end' ? p.x - w : p.x;
  return { x1: left, y1: p.y - h, x2: left + w, y2: p.y };
}

export const boxesOverlap = (a: Box, b: Box, pad = 0): boolean =>
  a.x1 < b.x2 + pad && a.x2 > b.x1 - pad && a.y1 < b.y2 + pad && a.y2 > b.y1 - pad;

export function primBox(p: Prim): Box {
  switch (p.t) {
    case 'line':
      return { x1: Math.min(p.x1, p.x2), y1: Math.min(p.y1, p.y2), x2: Math.max(p.x1, p.x2), y2: Math.max(p.y1, p.y2) };
    case 'rect':
      return { x1: p.x, y1: p.y, x2: p.x + p.w, y2: p.y + p.h };
    case 'circle':
      return { x1: p.cx - p.r, y1: p.cy - p.r, x2: p.cx + p.r, y2: p.cy + p.r };
    case 'poly': {
      const xs = p.pts.map((q) => q[0]);
      const ys = p.pts.map((q) => q[1]);
      return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
    }
    case 'text':
      return textBox(p);
  }
}

export function unionBox(boxes: Box[]): Box {
  return {
    x1: Math.min(...boxes.map((b) => b.x1)),
    y1: Math.min(...boxes.map((b) => b.y1)),
    x2: Math.max(...boxes.map((b) => b.x2)),
    y2: Math.max(...boxes.map((b) => b.y2)),
  };
}

export function translate(p: Prim, dx: number, dy: number): Prim {
  switch (p.t) {
    case 'line':
      return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
    case 'rect':
      return { ...p, x: p.x + dx, y: p.y + dy };
    case 'circle':
      return { ...p, cx: p.cx + dx, cy: p.cy + dy };
    case 'poly':
      return { ...p, pts: p.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    case 'text':
      return { ...p, x: p.x + dx, y: p.y + dy };
  }
}
