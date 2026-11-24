import type { PartId } from './model';
import { textWidth, type Box, type Prim } from './scene';

/**
 * Dimension placement: stacks dimension lines in lanes outside a view and keeps labels apart.
 * Conventions (ISO 129-1 style): thin extension lines with a small gap at the feature, filled
 * arrowheads, text above horizontal lines and rotated to read from the right on vertical lines.
 */

export const DIM_TEXT = 3;
const ARROW_LEN = 3;
const ARROW_HALF = 0.9;
const EXT_GAP = 1.2;
const EXT_OVER = 2;
const LANE_GAP = 7;
const FIRST_OFFSET = 9;
const LANE_PAD = 1.5;

export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface DimReq {
  key: string;
  /** 'h' measures along x, 'v' along y. */
  axis: 'h' | 'v';
  /** Paper coordinates of the two measured features along the axis. */
  a: number;
  b: number;
  /** Paper coordinate (across the axis) where each extension line starts. */
  from1: number;
  from2: number;
  side: Side;
  /** Model value in mm, printed as an integer. */
  value: number;
  est: boolean;
  part: PartId;
  prefix?: string;
}

interface Placed extends DimReq {
  lo: number;
  hi: number;
  label: string;
  inside: boolean;
  /** Extent along the axis including text placed outside the arrows. */
  spanLo: number;
  spanHi: number;
}

export const dimLabel = (r: Pick<DimReq, 'value' | 'prefix' | 'est'>): string =>
  `${r.prefix ?? ''}${Math.round(r.value)}${r.est ? '*' : ''}`;

function place(r: DimReq): Placed {
  const lo = Math.min(r.a, r.b);
  const hi = Math.max(r.a, r.b);
  const label = dimLabel(r);
  const tw = textWidth(label, DIM_TEXT);
  const arrowsInside = hi - lo >= 2 * ARROW_LEN + 1;
  const inside = arrowsInside && hi - lo >= tw + 2 * ARROW_LEN + 1;
  const outerLo = arrowsInside ? lo : lo - ARROW_LEN - 1;
  const outerHi = arrowsInside ? hi : hi + ARROW_LEN + 1;
  return {
    ...r,
    lo,
    hi,
    label,
    inside,
    spanLo: outerLo,
    spanHi: inside ? outerHi : hi + ARROW_LEN + 2 + tw,
  };
}

/** Assign each dimension to the nearest lane whose existing dimensions it does not overlap. */
function assignLanes(items: Placed[]): number[] {
  const order = items.map((_, i) => i).sort((i, j) => {
    const a = items[i]!;
    const b = items[j]!;
    return a.spanHi - a.spanLo - (b.spanHi - b.spanLo) || a.lo - b.lo;
  });
  const lanes: Placed[][] = [];
  const result = new Array<number>(items.length).fill(0);
  for (const idx of order) {
    const it = items[idx]!;
    let lane = lanes.findIndex((l) => l.every((o) => it.spanLo > o.spanHi + LANE_PAD || it.spanHi < o.spanLo - LANE_PAD));
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane]!.push(it);
    result[idx] = lane;
  }
  return result;
}

function arrow(tipX: number, tipY: number, dx: number, dy: number, r: Placed): Prim {
  // arrowhead pointing in direction (dx,dy) toward the tip
  const bx = tipX - dx * ARROW_LEN;
  const by = tipY - dy * ARROW_LEN;
  const nx = -dy * ARROW_HALF;
  const ny = dx * ARROW_HALF;
  return {
    t: 'poly',
    pts: [
      [tipX, tipY],
      [bx + nx, by + ny],
      [bx - nx, by - ny],
    ],
    closed: true,
    fill: 'solid',
    layer: r.est ? 'DIM_EST' : 'DIM',
    style: r.est ? 'dimEst' : 'dim',
    part: r.part,
    dimKey: r.key,
  };
}

export function layoutDimensions(reqs: DimReq[], bounds: Box): Prim[] {
  const out: Prim[] = [];
  const bySide = new Map<Side, Placed[]>();
  for (const r of reqs) {
    const p = place(r);
    const list = bySide.get(r.side) ?? [];
    list.push(p);
    bySide.set(r.side, list);
  }

  for (const [side, items] of bySide) {
    const lanes = assignLanes(items);
    items.forEach((r, i) => {
      const k = lanes[i]!;
      const off = FIRST_OFFSET + k * LANE_GAP;
      const horizontal = r.axis === 'h';
      // coordinate of the dimension line across the axis
      const pos =
        side === 'top' ? bounds.y1 - off : side === 'bottom' ? bounds.y2 + off : side === 'left' ? bounds.x1 - off : bounds.x2 + off;
      const layer = r.est ? 'DIM_EST' : 'DIM';
      const style = r.est ? 'dimEst' : 'dim';
      const common = { layer, part: r.part, dimKey: r.key } as const;

      // extension lines
      for (const [at, from] of [[r.a, r.from1], [r.b, r.from2]] as const) {
        const dir = Math.sign(pos - from) || 1;
        const start = from + dir * EXT_GAP;
        const end = pos + dir * EXT_OVER;
        if (Math.abs(end - start) < 0.5) continue;
        out.push(
          horizontal
            ? { t: 'line', x1: at, y1: start, x2: at, y2: end, style: 'thin', ...common }
            : { t: 'line', x1: start, y1: at, x2: end, y2: at, style: 'thin', ...common },
        );
      }

      // dimension line with arrowheads
      const lineLo = r.inside || r.hi - r.lo >= 2 * ARROW_LEN + 1 ? r.lo : r.lo - ARROW_LEN - 1;
      const lineHi = r.inside || r.hi - r.lo >= 2 * ARROW_LEN + 1 ? r.hi : r.hi + ARROW_LEN + 1;
      const arrowsInside = r.hi - r.lo >= 2 * ARROW_LEN + 1;
      out.push(
        horizontal
          ? { t: 'line', x1: lineLo, y1: pos, x2: lineHi, y2: pos, style, ...common }
          : { t: 'line', x1: pos, y1: lineLo, x2: pos, y2: lineHi, style, ...common },
      );
      const dirLo = arrowsInside ? 1 : -1; // direction the lo-arrow points
      if (horizontal) {
        out.push(arrow(r.lo, pos, -dirLo, 0, r), arrow(r.hi, pos, dirLo, 0, r));
      } else {
        out.push(arrow(pos, r.lo, 0, -dirLo, r), arrow(pos, r.hi, 0, dirLo, r));
      }

      // text
      if (horizontal) {
        out.push({
          t: 'text', x: r.inside ? (r.lo + r.hi) / 2 : r.hi + ARROW_LEN + 2, y: pos - 1, text: r.label, size: DIM_TEXT,
          anchor: r.inside ? 'middle' : 'start', italic: r.est, est: r.est, style: 'dim', ...common,
        });
      } else {
        out.push({
          t: 'text', x: pos - 1, y: r.inside ? (r.lo + r.hi) / 2 : r.hi + ARROW_LEN + 2, text: r.label, size: DIM_TEXT,
          anchor: r.inside ? 'middle' : 'end', rot: 90, italic: r.est, est: r.est, style: 'dim', ...common,
        });
      }
    });
  }
  return out;
}
