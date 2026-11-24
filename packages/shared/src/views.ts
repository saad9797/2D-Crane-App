import { layoutDimensions, type DimReq } from './dimensions';
import type { CraneModel, PartId } from './model';
import { primBox, unionBox, type Box, type Fill, type LineStyle, type Prim } from './scene';

/**
 * The three orthographic views, drawn in local paper millimetres (origin arbitrary, y down).
 * Projection: first angle (plan under the front elevation, view from the left to its right).
 * Outlines are schematic; every printed number comes from the CraneModel.
 */

export interface ViewResult {
  prims: Prim[];
  box: Box;
}

const LAYER: Record<LineStyle, string> = {
  visible: 'OUTLINE',
  thin: 'THIN',
  hidden: 'HIDDEN',
  centre: 'CENTRE',
  ghost: 'GHOST',
  dim: 'DIM',
  dimEst: 'DIM_EST',
  border: 'BORDER',
};

class ViewBuilder {
  readonly prims: Prim[] = [];
  /** @param up true for elevations (model v = z points up the page), false for the plan. */
  constructor(
    readonly scale: number,
    private readonly up: boolean,
  ) {}

  X(u: number): number {
    return u / this.scale;
  }
  Y(v: number): number {
    return (this.up ? -v : v) / this.scale;
  }

  line(u1: number, v1: number, u2: number, v2: number, style: LineStyle, part?: PartId): void {
    this.prims.push({ t: 'line', x1: this.X(u1), y1: this.Y(v1), x2: this.X(u2), y2: this.Y(v2), style, layer: LAYER[style], ...(part ? { part } : {}) });
  }

  rect(u1: number, v1: number, u2: number, v2: number, style: LineStyle, fill: Fill, part?: PartId): void {
    const xa = this.X(Math.min(u1, u2));
    const xb = this.X(Math.max(u1, u2));
    const ya = this.Y(v1);
    const yb = this.Y(v2);
    this.prims.push({ t: 'rect', x: xa, y: Math.min(ya, yb), w: xb - xa, h: Math.abs(yb - ya), fill, style, layer: LAYER[style], ...(part ? { part } : {}) });
  }

  circle(u: number, v: number, r: number, style: LineStyle, fill: Fill, part?: PartId): void {
    this.prims.push({ t: 'circle', cx: this.X(u), cy: this.Y(v), r: r / this.scale, fill, style, layer: LAYER[style], ...(part ? { part } : {}) });
  }

  poly(pts: [number, number][], style: LineStyle, part?: PartId): void {
    this.prims.push({ t: 'poly', pts: pts.map(([u, v]) => [this.X(u), this.Y(v)] as [number, number]), closed: false, fill: 'none', style, layer: LAYER[style], ...(part ? { part } : {}) });
  }

  box(): Box {
    return unionBox(this.prims.map(primBox));
  }
}

const isEst = (m: CraneModel, key: string): boolean => m.dims.find((d) => d.key === key)?.status === 'estimate';

/** Hook ring, optionally with a small block above it. */
function hook(b: ViewBuilder, u: number, v: number, r: number, block: boolean, style: LineStyle): void {
  b.circle(u, v, r, style, 'none', 'hook');
  if (block) {
    b.rect(u - r, v + 1.05 * r, u + r, v + 2.05 * r, style, 'light', 'hook');
    b.line(u, v + r, u, v + 1.05 * r, style, 'hook');
  }
}

const hookRadius = (m: CraneModel): number => Math.min(450, 60 + 8 * m.capacityT);
const wheelWidth = (m: CraneModel): number => Math.round(0.45 * m.wheelDia);
const beamDepth = (m: CraneModel): number => Math.max(400, Math.round(1.6 * m.wheelDia));

function finish(b: ViewBuilder, dims: DimReq[], title: string, scaleLabel: string): ViewResult {
  const geo = b.box();
  const prims = [...b.prims, ...layoutDimensions(dims, geo)];
  const all = unionBox(prims.map(primBox));
  const cx = (geo.x1 + geo.x2) / 2;
  prims.push({
    t: 'text', x: cx, y: all.y2 + 6, text: `${title}   ${scaleLabel}`, size: 3.5, anchor: 'middle', bold: true, style: 'dim', layer: 'TEXT',
  });
  return { prims, box: unionBox(prims.map(primBox)) };
}

export function buildFront(m: CraneModel, scale: number): ViewResult {
  const b = new ViewBuilder(scale, true);
  const S = m.spanMm;
  const e = m.endOverhang;
  const rh = m.rail.height;
  const hw = m.rail.headWidth;
  const single = m.type === 'single-girder';
  const zb = m.girderBottomZ;
  const zt = m.girderTopZ;
  const beamBot = -rh - beamDepth(m);
  const ecBot = -Math.round(0.1 * m.wheelDia);
  const ecTop = Math.round(1.15 * m.wheelDia);
  const r = hookRadius(m);
  const xt = m.trolleyX;
  const a = m.hookApproach;

  // floor with hatch ticks
  const fl = m.floorZ;
  b.line(-e - 1500, fl, S + e + 1500, fl, 'visible', 'floor');
  const tick = 2 * scale;
  for (let u = -e - 1500; u < S + e + 1500; u += 2.5 * scale) b.line(u, fl, u - tick, fl - tick, 'thin', 'floor');

  // runway supports, beams and rails at both ends
  for (const x of [0, S]) {
    b.rect(x - 200, beamBot, x + 200, fl, 'ghost', 'none', 'rail');
    b.rect(x - e, beamBot, x + e, -rh, 'visible', 'paper', 'rail');
    b.rect(x - hw / 2, -rh, x + hw / 2, 0, 'visible', 'light', 'rail');
  }

  // girder first, then end carriages over its ends
  b.rect(-e, zb, S + e, zt, 'visible', 'paper', 'girder');
  for (const x of [0, S]) {
    b.rect(x - e, ecBot, x + e, ecTop, 'visible', 'paper', 'end-carriage');
    b.rect(x - wheelWidth(m) / 2, 0, x + wheelWidth(m) / 2, m.wheelDia, 'hidden', 'none', 'wheel');
  }

  // hoist / crab, rope and hooks
  const hl = m.hoistLengthX;
  if (single) {
    b.rect(xt - hl / 2, zb - m.hoistBodyHeight, xt + hl / 2, zb, 'visible', 'light', 'hoist');
    b.rect(xt - 0.3 * hl, zb - m.hoistBodyHeight + 60, xt + 0.3 * hl, zb - 60, 'thin', 'none', 'hoist');
    const blockTop = m.hookHighZ + 2.05 * r;
    if (zb - m.hoistBodyHeight > blockTop) b.line(xt, zb - m.hoistBodyHeight, xt, blockTop, 'thin', 'hook');
    hook(b, xt, m.hookHighZ, r, true, 'visible');
  } else {
    b.rect(xt - hl / 2, zt, xt + hl / 2, zt + 0.35 * m.crabHeight, 'visible', 'light', 'hoist');
    b.rect(xt - 0.35 * hl, zt + 0.35 * m.crabHeight, xt + 0.35 * hl, zt + m.crabHeight, 'visible', 'light', 'hoist');
    b.line(xt, zb, xt, m.hookHighZ + r, 'thin', 'hook');
    hook(b, xt, m.hookHighZ, r, false, 'visible');
  }
  // hook at its lowest position on the rope
  b.line(xt, m.hookHighZ - r, xt, m.hookLowZ + 2.05 * r, 'thin', 'hook');
  hook(b, xt, m.hookLowZ + r, r, true, 'visible');

  // hook approach limits (ghost hooks) and rail centre lines
  for (const x of [a, S - a]) {
    b.circle(x, m.hookHighZ, r, 'ghost', 'none', 'hook');
    b.line(x, m.hookHighZ - r, x, fl - 400, 'centre', 'hook');
  }
  for (const x of [0, S]) b.line(x, zt + 300, x, fl - 400, 'centre', 'rail');

  // dimensions
  const X = (u: number): number => b.X(u);
  const Y = (v: number): number => b.Y(v);
  const dims: DimReq[] = [];
  const topFrom = Y(Math.max(zt, ecTop));
  dims.push(
    { key: 'span', axis: 'h', a: X(0), b: X(S), from1: topFrom, from2: topFrom, side: 'top', value: S, est: false, part: 'crane' },
    { key: 'overallLength', axis: 'h', a: X(-e), b: X(S + e), from1: topFrom, from2: topFrom, side: 'top', value: m.overallLength, est: isEst(m, 'overallLength'), part: 'end-carriage' },
  );
  const xr = X(S + e);
  const headFrom = single ? xr : X(xt + 0.35 * hl);
  dims.push(
    { key: 'girderDepth', axis: 'v', a: Y(zt), b: Y(zb), from1: xr, from2: xr, side: 'right', value: m.girderDepth, est: isEst(m, 'girderDepth'), part: 'girder' },
    { key: 'headroom', axis: 'v', a: Y(m.headroom), b: Y(0), from1: headFrom, from2: X(S + hw / 2), side: 'right', value: m.headroom, est: isEst(m, 'headroom'), part: 'crane' },
    { key: 'hookOffset', axis: 'v', a: Y(0), b: Y(m.hookHighZ), from1: X(S + hw / 2), from2: X(xt + r), side: 'right', value: -m.hookHighZ, est: isEst(m, 'hookOffset'), part: 'hook' },
    { key: 'liftHeight', axis: 'v', a: Y(m.hookHighZ), b: Y(fl), from1: X(xt + r), from2: xr, side: 'right', value: m.liftMm, est: false, part: 'hook' },
    { key: 'minRailHeight', axis: 'v', a: Y(0), b: Y(fl), from1: X(S + hw / 2), from2: xr, side: 'right', value: m.minRailHeightAboveFloor, est: isEst(m, 'minRailHeight'), part: 'floor' },
  );
  const fy = Y(fl);
  dims.push(
    { key: 'hookApproach', axis: 'h', a: X(0), b: X(a), from1: fy, from2: fy, side: 'bottom', value: a, est: isEst(m, 'hookApproach'), part: 'hook' },
    { key: 'hookApproach', axis: 'h', a: X(S - a), b: X(S), from1: fy, from2: fy, side: 'bottom', value: a, est: isEst(m, 'hookApproach'), part: 'hook' },
  );
  return finish(b, dims, 'FRONT ELEVATION', `1:${scale}`);
}

export function buildEnd(m: CraneModel, scale: number): ViewResult {
  const b = new ViewBuilder(scale, true);
  const single = m.type === 'single-girder';
  const B = m.overallWidth;
  const W = m.wheelbase;
  const D = m.wheelDia;
  const rh = m.rail.height;
  const zb = m.girderBottomZ;
  const zt = m.girderTopZ;
  const r = hookRadius(m);
  const bw = m.girderWidth;
  const K = m.girderSpacing;
  const strip = B / 2 + 600;

  // runway rail and beam seen lengthwise
  b.rect(-strip, -rh - 120, strip, -rh, 'visible', 'paper', 'rail');
  b.rect(-strip, -rh, strip, 0, 'visible', 'light', 'rail');

  // end carriage beam, wheels
  b.rect(-B / 2, D / 2 - 0.28 * D, B / 2, D / 2 + 0.28 * D, 'visible', 'paper', 'end-carriage');
  const wheelYs = m.wheelsPerEnd === 2 ? [-W / 2, W / 2] : [-W / 2, -W / 2 + m.bogiePitch, W / 2 - m.bogiePitch, W / 2];
  for (const y of wheelYs) {
    b.circle(y, D / 2, D / 2, 'visible', 'paper', 'wheel');
    b.circle(y, D / 2, 0.12 * D, 'thin', 'none', 'wheel');
  }

  // girder section(s)
  const girderYs = single ? [0] : [-K / 2, K / 2];
  for (const y of girderYs) b.rect(y - bw / 2, zb, y + bw / 2, zt, 'visible', 'paper', 'girder');

  // hoist / crab and hook
  if (single) {
    const hy = m.hoistWidthY / 2;
    b.rect(-hy, zb - m.hoistBodyHeight, hy, zb, 'visible', 'light', 'hoist');
    b.rect(-0.55 * hy, zb - m.hoistBodyHeight + 60, 0.55 * hy, zb - 60, 'thin', 'none', 'hoist');
    const blockTop = m.hookHighZ + 2.05 * r;
    if (zb - m.hoistBodyHeight > blockTop) b.line(0, zb - m.hoistBodyHeight, 0, blockTop, 'thin', 'hook');
    hook(b, 0, m.hookHighZ, r, true, 'visible');
  } else {
    const half = (K + bw) / 2 + 150;
    b.rect(-half, zt, half, zt + 0.35 * m.crabHeight, 'visible', 'light', 'hoist');
    b.rect(-0.4 * K, zt + 0.35 * m.crabHeight, 0.4 * K, zt + m.crabHeight, 'visible', 'light', 'hoist');
    b.line(-0.5 * r, zt, -0.5 * r, m.hookHighZ + r, 'thin', 'hook');
    b.line(0.5 * r, zt, 0.5 * r, m.hookHighZ + r, 'thin', 'hook');
    hook(b, 0, m.hookHighZ, r, false, 'visible');
  }
  b.line(0, Math.max(zt, m.headroom) + 300, 0, m.hookHighZ - 2 * r, 'centre', 'crane');

  // dimensions
  const X = (u: number): number => b.X(u);
  const Y = (v: number): number => b.Y(v);
  const dims: DimReq[] = [];
  const y0 = Y(0);
  dims.push(
    { key: 'wheelbase', axis: 'h', a: X(-W / 2), b: X(W / 2), from1: y0, from2: y0, side: 'bottom', value: W, est: isEst(m, 'wheelbase'), part: 'end-carriage' },
    { key: 'overallWidth', axis: 'h', a: X(-B / 2), b: X(B / 2), from1: y0, from2: y0, side: 'bottom', value: B, est: isEst(m, 'overallWidth'), part: 'end-carriage' },
  );
  if (!single) {
    const yb = Y(zb);
    dims.push({ key: 'girderSpacing', axis: 'h', a: X(-K / 2), b: X(K / 2), from1: yb, from2: yb, side: 'bottom', value: K, est: isEst(m, 'girderSpacing'), part: 'girder' });
  }
  const gx = X(girderYs[girderYs.length - 1]! + bw / 2);
  dims.push({ key: 'girderDepth', axis: 'v', a: Y(zt), b: Y(zb), from1: gx, from2: gx, side: 'right', value: m.girderDepth, est: isEst(m, 'girderDepth'), part: 'girder' });

  // wheel diameter leader on the left wheel
  const wx = X(-W / 2);
  const wy = Y(D / 2);
  const rr = D / 2 / scale;
  const lx = wx - rr * Math.SQRT1_2;
  const ly = wy - rr * Math.SQRT1_2;
  const ex = lx - 9;
  const ey = ly - 9;
  b.prims.push({ t: 'line', x1: lx, y1: ly, x2: ex, y2: ey, style: 'dim', layer: 'DIM', part: 'wheel', dimKey: 'wheelDia' });
  b.prims.push({ t: 'line', x1: ex, y1: ey, x2: ex - 3, y2: ey, style: 'dim', layer: 'DIM', part: 'wheel', dimKey: 'wheelDia' });
  const estD = isEst(m, 'wheelDia');
  b.prims.push({
    t: 'text', x: ex - 4, y: ey + 1, text: `Ø${D}${estD ? '*' : ''}`, size: 3, anchor: 'end', italic: estD, est: estD, style: 'dim', layer: 'TEXT', part: 'wheel', dimKey: 'wheelDia',
  });
  return finish(b, dims, 'VIEW FROM LEFT', `1:${scale}`);
}

export function buildPlan(m: CraneModel, scale: number): ViewResult {
  const b = new ViewBuilder(scale, false);
  const single = m.type === 'single-girder';
  const S = m.spanMm;
  const e = m.endOverhang;
  const B = m.overallWidth;
  const W = m.wheelbase;
  const D = m.wheelDia;
  const hw = m.rail.headWidth;
  const bw = m.girderWidth;
  const K = m.girderSpacing;
  const xt = m.trolleyX;
  const run = B / 2 + 700;

  // runway beams and rails with break lines
  for (const x of [0, S]) {
    b.rect(x - e, -run, x + e, run, 'thin', 'none', 'rail');
    b.line(x - hw / 2, -run, x - hw / 2, run, 'thin', 'rail');
    b.line(x + hw / 2, -run, x + hw / 2, run, 'thin', 'rail');
    for (const y of [-run, run]) b.poly([[x - e - 100, y], [x - 60, y - 120], [x + 60, y + 120], [x + e + 100, y]], 'thin', 'rail');
  }

  // girders, then end carriages over their ends
  const girderYs = single ? [0] : [-K / 2, K / 2];
  for (const y of girderYs) b.rect(-e, y - bw / 2, S + e, y + bw / 2, 'visible', 'paper', 'girder');
  for (const x of [0, S]) {
    b.rect(x - e, -B / 2, x + e, B / 2, 'visible', 'paper', 'end-carriage');
    const ys = m.wheelsPerEnd === 2 ? [-W / 2, W / 2] : [-W / 2, -W / 2 + m.bogiePitch, W / 2 - m.bogiePitch, W / 2];
    for (const y of ys) b.rect(x - wheelWidth(m) / 2, y - D / 2, x + wheelWidth(m) / 2, y + D / 2, 'thin', 'none', 'wheel');
  }

  // trolley / crab and hook position
  const hl = m.hoistLengthX;
  const hy = m.hoistWidthY / 2;
  b.rect(xt - hl / 2, -hy, xt + hl / 2, hy, 'visible', 'light', 'hoist');
  b.rect(xt - 0.3 * hl, -0.55 * hy, xt + 0.3 * hl, 0.55 * hy, 'thin', 'none', 'hoist');
  b.line(xt - 350, 0, xt + 350, 0, 'centre', 'hook');
  b.line(xt, -350, xt, 350, 'centre', 'hook');

  // centre lines
  for (const x of [0, S]) b.line(x, -B / 2 - 400, x, B / 2 + 400, 'centre', 'rail');
  b.line(-e - 300, 0, S + e + 300, 0, 'centre', 'girder');

  // dimensions
  const X = (u: number): number => b.X(u);
  const Y = (v: number): number => b.Y(v);
  const xr = X(S + e);
  const xl = X(-e);
  const dims: DimReq[] = [
    { key: 'overallWidth', axis: 'v', a: Y(-B / 2), b: Y(B / 2), from1: xr, from2: xr, side: 'right', value: B, est: isEst(m, 'overallWidth'), part: 'end-carriage' },
    { key: 'wheelbase', axis: 'v', a: Y(-W / 2), b: Y(W / 2), from1: xl, from2: xl, side: 'left', value: W, est: isEst(m, 'wheelbase'), part: 'end-carriage' },
  ];
  if (!single) {
    dims.push({ key: 'girderSpacing', axis: 'v', a: Y(-K / 2), b: Y(K / 2), from1: xr, from2: xr, side: 'right', value: K, est: isEst(m, 'girderSpacing'), part: 'girder' });
  }
  return finish(b, dims, 'PLAN', `1:${scale}`);
}
