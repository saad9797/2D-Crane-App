import { createHash } from 'node:crypto';
import DxfParser from 'dxf-parser';
import { describe, expect, it } from 'vitest';
import {
  CAPACITY_SERIES_T,
  DEFAULT_INPUTS,
  PRESETS,
  analyze,
  boxesOverlap,
  buildScene,
  checkModel,
  craneInputsSchema,
  deriveModel,
  escapeXml,
  parseInputs,
  primBox,
  sceneToDxf,
  sceneToSvg,
  textBox,
  type CraneInputs,
  type CraneModel,
  type Prim,
  type TextPrim,
} from './index';

const META = { name: 'Test design', revision: 1, date: '2026-11-24' };
const model = (o: Partial<CraneInputs> = {}): CraneModel => {
  const a = analyze({ ...DEFAULT_INPUTS, ...o });
  if (!a.ok || !a.model) throw new Error(`invalid test inputs: ${JSON.stringify(a.issues)}`);
  return a.model;
};
const paths = (raw: unknown, severity?: 'error' | 'warning'): string[] =>
  analyze(raw).issues.filter((i) => !severity || i.severity === severity).map((i) => i.path);

describe('input schema: boundaries and types', () => {
  it('accepts the defaults and every preset', () => {
    expect(analyze(DEFAULT_INPUTS).ok).toBe(true);
    for (const p of PRESETS) expect(analyze(p.inputs).ok, p.id).toBe(true);
  });

  it.each([
    ['spanM', 4.9],
    ['spanM', 35.1],
    ['spanM', 0],
    ['spanM', -5],
    ['spanM', 12.345],
    ['liftHeightM', 1.9],
    ['liftHeightM', 30.1],
    ['dutyGroup', 0],
    ['dutyGroup', 9],
    ['dutyGroup', 4.5],
    ['trolleyPositionPct', -1],
    ['trolleyPositionPct', 101],
    ['capacityT', 7],
    ['capacityT', 0],
    ['capacityT', 100],
  ])('rejects %s = %s', (field, value) => {
    const r = parseInputs({ ...DEFAULT_INPUTS, [field]: value });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.path)).toContain(field);
  });

  it.each([
    ['spanM', 5],
    ['spanM', 35],
    ['liftHeightM', 2],
    ['liftHeightM', 30],
    ['dutyGroup', 1],
    ['dutyGroup', 8],
    ['trolleyPositionPct', 0],
    ['trolleyPositionPct', 100],
  ])('accepts boundary %s = %s', (field, value) => {
    expect(parseInputs({ ...DEFAULT_INPUTS, [field]: value }).ok).toBe(true);
  });

  it('accepts only the preferred capacity series', () => {
    for (const c of CAPACITY_SERIES_T) expect(craneInputsSchema.shape.capacityT.safeParse(c).success).toBe(true);
    expect(craneInputsSchema.shape.capacityT.safeParse(7.5).success).toBe(false);
  });

  it('rejects wrong types: numeric strings, NaN, Infinity, null, booleans', () => {
    for (const bad of ['18', NaN, Infinity, -Infinity, null, true, {}, []]) {
      expect(paths({ ...DEFAULT_INPUTS, spanM: bad })).toContain('spanM');
    }
    expect(paths({ ...DEFAULT_INPUTS, lowHeadroomHoist: 'yes' })).toContain('lowHeadroomHoist');
    expect(paths({ ...DEFAULT_INPUTS, craneType: 'gantry' })).toContain('craneType');
  });

  it('reports missing and unknown fields by path', () => {
    const { spanM: _omit, ...rest } = DEFAULT_INPUTS;
    expect(paths(rest)).toContain('spanM');
    const unknown = analyze({ ...DEFAULT_INPUTS, hacker: 1 });
    expect(unknown.ok).toBe(false);
    expect(unknown.issues.find((i) => i.path === 'hacker')?.code).toBe('unknown_field');
    expect(analyze(null).ok).toBe(false);
    expect(analyze('x').ok).toBe(false);
  });

  it('messages say how much is allowed', () => {
    const msg = analyze({ ...DEFAULT_INPUTS, spanM: 50 }).issues[0]?.message ?? '';
    expect(msg).toMatch(/at most 35 m/);
  });
});

describe('cross-field rules (errors block, warnings do not)', () => {
  it('single girder above 20 t is an error on capacityT', () => {
    const a = analyze({ ...DEFAULT_INPUTS, craneType: 'single-girder', capacityT: 25 });
    expect(a.ok).toBe(false);
    expect(a.issues.find((i) => i.code === 'single_capacity_max')?.hint).toMatch(/double-girder/);
  });
  it('single girder above 31.5 m is an error on spanM', () => {
    expect(paths({ ...DEFAULT_INPUTS, craneType: 'single-girder', capacityT: 5, spanM: 33 }, 'error')).toContain('spanM');
  });
  it('single girder 16 < Q <= 20, span 25..31.5, duty >= 7 and lift > 18 warn but stay valid', () => {
    const base = { ...DEFAULT_INPUTS, craneType: 'single-girder' as const, capacityT: 20, spanM: 28, dutyGroup: 7, liftHeightM: 20 };
    const a = analyze(base);
    expect(a.ok).toBe(true);
    expect(a.issues.map((i) => i.code).sort()).toEqual(['single_capacity_high', 'single_duty_heavy', 'single_lift_high', 'single_span_long']);
    expect(a.issues.every((i) => i.severity === 'warning')).toBe(true);
  });
  it('low-headroom hoist on a double girder is an error on that field', () => {
    expect(paths({ ...DEFAULT_INPUTS, lowHeadroomHoist: true }, 'error')).toEqual(['lowHeadroomHoist']);
  });
  it('double girder below 5 t and spans under 7.5 m warn', () => {
    const a = analyze({ ...DEFAULT_INPUTS, capacityT: 2, spanM: 6 });
    expect(a.ok).toBe(true);
    expect(a.issues.map((i) => i.code).sort()).toEqual(['double_capacity_low', 'span_short']);
  });
  it('model-level checks flag too little hook travel and over-heavy wheels (defensive: unreachable from valid inputs)', () => {
    const m = model();
    const short = checkModel({ ...m, usableTravel: 500 });
    expect(short.find((i) => i.code === 'span_too_short_for_hoist')).toMatchObject({ severity: 'error', path: 'spanM' });
    expect(short.find((i) => i.code === 'span_too_short_for_hoist')?.hint).toMatch(/Increase the span/);
    expect(checkModel({ ...m, wheelLoadKN: 900 }).find((i) => i.code === 'wheel_load_too_high')?.severity).toBe('error');
    expect(checkModel(m)).toEqual([]);
  });
  it('the shortest valid spans still leave a metre or more of hook travel', () => {
    expect(model({ craneType: 'single-girder', capacityT: 20, spanM: 5 }).usableTravel).toBeGreaterThanOrEqual(1000);
  });
  it('a heavier rail than needed is fine, a lighter one warns', () => {
    expect(analyze({ ...DEFAULT_INPUTS, railType: 'A100' }).issues.filter((i) => i.code === 'rail_undersized')).toHaveLength(0);
    const a = analyze({ ...DEFAULT_INPUTS, capacityT: 40, spanM: 30, railType: 'A45' });
    expect(a.ok).toBe(true);
    expect(a.issues.find((i) => i.code === 'rail_undersized')?.path).toBe('railType');
  });
  it('errors suppress the model; warnings keep it', () => {
    expect(analyze({ ...DEFAULT_INPUTS, spanM: 1 }).model).toBeUndefined();
    expect(analyze({ ...DEFAULT_INPUTS, capacityT: 2 }).model).toBeDefined();
  });
});

describe('model: calibration against the company sample (10 t, 25 m, single girder, A5)', () => {
  const m = model({ craneType: 'single-girder', capacityT: 10, spanM: 25, dutyGroup: 5, liftHeightM: 7.9, lowHeadroomHoist: true });
  it('overall length is span + 270 mm (sample: 25270)', () => {
    expect(m.overallLength).toBe(25270);
  });
  it('wheelbase is within 10 % of the sample 3800 mm', () => {
    expect(Math.abs(m.wheelbase - 3800) / 3800).toBeLessThan(0.1);
  });
  it('overall width is within 6 % of the sample 4310 mm', () => {
    expect(Math.abs(m.overallWidth - 4310) / 4310).toBeLessThan(0.06);
  });
  it('wheel is the sample 250 mm', () => {
    expect(m.wheelDia).toBe(250);
  });
  it('hook approach equals the sample 1150 mm and low headroom is 620 mm', () => {
    expect(m.hookApproach).toBe(1150);
    expect(m.hoistHeadroom).toBe(620);
  });
  it('wheel load is within 10 % of the sample 74.8 kN and crane mass within 10 % of 8.9 t', () => {
    expect(Math.abs(m.wheelLoadKN - 74.8) / 74.8).toBeLessThan(0.1);
    expect(Math.abs(m.craneMassT - 8.9) / 8.9).toBeLessThan(0.1);
  });
});

describe('model: rules hold over the whole input grid', () => {
  const grid: CraneInputs[] = [];
  for (const craneType of ['single-girder', 'double-girder'] as const)
    for (const capacityT of CAPACITY_SERIES_T)
      for (const spanM of [5, 7.5, 12, 18, 25, 31.5, 35])
        for (const dutyGroup of [1, 5, 8])
          for (const liftHeightM of [2, 12, 30])
            grid.push({ ...DEFAULT_INPUTS, craneType, capacityT, spanM, dutyGroup, liftHeightM, trolleyPositionPct: 50 });
  const valid = grid.map((g) => analyze(g)).filter((a) => a.ok && a.model).map((a) => a.model as CraneModel);

  it('covers a meaningful grid', () => {
    expect(valid.length).toBeGreaterThan(500);
  });
  it('wheelbase never drops below the CMAA 74 minimum of span/8 (F-03)', () => {
    for (const m of valid) expect(m.wheelbase).toBeGreaterThanOrEqual(m.spanMm / 8);
  });
  it('dimensions add up', () => {
    for (const m of valid) {
      expect(m.overallLength).toBe(m.spanMm + 2 * m.endOverhang);
      expect(m.minRailHeightAboveFloor).toBe(-m.hookHighZ + m.liftMm);
      expect(m.usableTravel).toBe(m.spanMm - 2 * m.hookApproach);
      expect(m.girderTopZ - m.girderBottomZ).toBe(m.girderDepth);
      expect(m.floorZ).toBe(m.hookHighZ - m.liftMm);
    }
  });
  it('nothing is negative, non-finite or inverted', () => {
    for (const m of valid) {
      for (const d of m.dims) {
        expect(Number.isFinite(d.value), d.key).toBe(true);
        expect(d.value, d.key).toBeGreaterThan(0);
      }
      expect(m.usableTravel).toBeGreaterThanOrEqual(1000);
      expect(m.hookHighZ).toBeLessThan(m.girderBottomZ);
      expect(m.trolleyX).toBeGreaterThanOrEqual(m.hookApproach);
      expect(m.trolleyX).toBeLessThanOrEqual(m.spanMm - m.hookApproach);
      expect(m.girderDepth).toBeLessThan(m.spanMm);
    }
  });
  it('end carriage wheels fit inside the overall width', () => {
    for (const m of valid) {
      expect(m.overallWidth).toBeGreaterThan(m.wheelbase + m.wheelDia);
      if (m.wheelsPerEnd === 4) expect(m.wheelbase / 2 - m.bogiePitch).toBeGreaterThan(0);
    }
  });
  it('only standard wheel sizes and DIN 536 rails are produced', () => {
    for (const m of valid) {
      expect([160, 200, 250, 315, 400, 500]).toContain(m.wheelDia);
      expect(['A45', 'A55', 'A65', 'A75', 'A100']).toContain(m.rail.section);
    }
  });
  it('is deterministic and monotonic in span for depth and mass', () => {
    const a = model({ spanM: 12 });
    const b = model({ spanM: 24 });
    expect(deriveModel(a.inputs)).toEqual(a);
    expect(b.girderDepth).toBeGreaterThanOrEqual(a.girderDepth);
    expect(b.craneMassT).toBeGreaterThan(a.craneMassT);
    expect(b.wheelbase).toBeGreaterThan(a.wheelbase);
  });
  it('every dimension has a formula, working, source and confidence; estimates are labelled', () => {
    for (const d of model().dims) {
      expect(d.formula.length).toBeGreaterThan(0);
      expect(d.working.length).toBeGreaterThan(0);
      expect(d.source.length).toBeGreaterThan(0);
      expect(['input', 'standard', 'estimate']).toContain(d.status);
    }
    expect(model().dims.filter((d) => d.status === 'input').map((d) => d.key).sort()).toEqual(['liftHeight', 'span']);
  });
});

/** All sheets drawn for scene-level checks. */
const sceneCases: [string, CraneInputs][] = [
  ...PRESETS.map((p) => [p.id, p.inputs] as [string, CraneInputs]),
  ['min-single', { ...DEFAULT_INPUTS, craneType: 'single-girder', capacityT: 1, spanM: 5, liftHeightM: 2, dutyGroup: 1 }],
  ['max-double', { ...DEFAULT_INPUTS, craneType: 'double-girder', capacityT: 50, spanM: 35, liftHeightM: 30, dutyGroup: 8 }],
  ['max-single', { ...DEFAULT_INPUTS, craneType: 'single-girder', capacityT: 20, spanM: 31.5, liftHeightM: 18, dutyGroup: 3 }],
  ['short-tall', { ...DEFAULT_INPUTS, craneType: 'double-girder', capacityT: 5, spanM: 5, liftHeightM: 30 }],
  ['long-low', { ...DEFAULT_INPUTS, craneType: 'double-girder', capacityT: 16, spanM: 35, liftHeightM: 2 }],
  ['trolley-left', { ...DEFAULT_INPUTS, trolleyPositionPct: 0 }],
  ['trolley-right', { ...DEFAULT_INPUTS, trolleyPositionPct: 100 }],
];

describe.each(sceneCases)('drawing sheet: %s', (_id, inputs) => {
  const m = model(inputs);
  const scene = buildScene(m, META);
  const FRAME = { x1: 20, y1: 10, x2: 410, y2: 287 };
  const content = scene.prims.filter((p) => !(p.t === 'rect' && p.w >= 390 && p.layer === 'BORDER'));

  it('is finite and every primitive sits inside the frame', () => {
    for (const p of content) {
      const b = primBox(p);
      for (const v of [b.x1, b.y1, b.x2, b.y2]) expect(Number.isFinite(v)).toBe(true);
      expect(b.x1).toBeGreaterThanOrEqual(FRAME.x1 - 0.01);
      expect(b.y1).toBeGreaterThanOrEqual(FRAME.y1 - 0.01);
      expect(b.x2).toBeLessThanOrEqual(FRAME.x2 + 0.01);
      expect(b.y2).toBeLessThanOrEqual(FRAME.y2 + 0.01);
    }
  });

  it('views contain all of their primitives and do not overlap each other or the title block', () => {
    const [front, plan, end] = ['front', 'plan', 'end'].map((id) => scene.views.find((v) => v.id === id)!);
    expect(boxesOverlap(front!.box, plan!.box)).toBe(false);
    expect(boxesOverlap(front!.box, end!.box)).toBe(false);
    expect(boxesOverlap(plan!.box, end!.box)).toBe(false);
    const titleBlock = { x1: 232, y1: 239, x2: 410, y2: 287 };
    for (const v of scene.views) {
      expect(boxesOverlap(v.box, titleBlock), v.id).toBe(false);
      expect(v.box.x1).toBeGreaterThanOrEqual(20);
      expect(v.box.y2).toBeLessThanOrEqual(287);
    }
  });

  it('has no overlapping text (dimension labels, titles, tables)', () => {
    const texts = scene.prims.filter((p): p is TextPrim => p.t === 'text');
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = textBox(texts[i]!);
        const b = textBox(texts[j]!);
        expect(boxesOverlap(a, b, -0.3), `"${texts[i]!.text}" overlaps "${texts[j]!.text}"`).toBe(false);
      }
    }
  });

  it('prints each dimension value exactly as the model computes it', () => {
    const byKey = new Map(m.dims.map((d) => [d.key, d]));
    const printed = scene.prims.filter((p): p is TextPrim => p.t === 'text' && !!p.dimKey);
    expect(printed.length).toBeGreaterThanOrEqual(10);
    for (const t of printed) {
      const d = byKey.get(t.dimKey!)!;
      expect(d, t.dimKey).toBeDefined();
      const num = Number(t.text.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, ''));
      const expected = t.dimKey === 'wheelDia' ? m.wheelDia : Math.round(d.value);
      expect(num, `${t.dimKey}: ${t.text}`).toBe(expected);
      expect(t.text.endsWith('*'), `${t.dimKey} estimate marker`).toBe(d.status === 'estimate');
    }
  });

  it('puts the same scale in the title block as on the views', () => {
    expect(scene.sheetScale).toBeGreaterThan(0);
    const texts = scene.prims.filter((p): p is TextPrim => p.t === 'text').map((p) => p.text);
    expect(texts).toContain(`1:${scene.sheetScale}`);
  });

  it('shows the not-for-fabrication note and the estimate legend', () => {
    const texts = scene.prims.filter((p): p is TextPrim => p.t === 'text').map((p) => p.text);
    expect(texts.some((t) => t.includes('NOT FOR FABRICATION'))).toBe(true);
    expect(texts.some((t) => t.startsWith('* = ESTIMATED'))).toBe(true);
  });
});

describe('renderers', () => {
  const m = model(PRESETS[2]!.inputs);
  const scene = buildScene(m, { ...META, name: '<script>alert(1)</script> & "q"' });

  it('escapes user text in SVG', () => {
    const svg = sceneToSvg(scene, { standalone: true });
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg.startsWith('<svg xmlns=')).toBe(true);
    expect(escapeXml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('is deterministic', () => {
    expect(sceneToSvg(buildScene(m, META))).toBe(sceneToSvg(buildScene(m, META)));
    expect(sceneToDxf(buildScene(m, META))).toBe(sceneToDxf(buildScene(m, META)));
  });

  it('DXF parses back: layers, entity counts, extents, text', () => {
    const dxf = sceneToDxf(scene);
    const parsed = new DxfParser().parseSync(dxf);
    expect(parsed).toBeTruthy();
    const ents = parsed!.entities;
    const count = (t: string): number => ents.filter((e) => e.type === t).length;
    const lines = scene.prims.reduce((n, p: Prim) => {
      if (p.t === 'line') return n + 1;
      if (p.t === 'rect') return n + 4;
      if (p.t === 'poly') return n + (p.closed ? p.pts.length : p.pts.length - 1);
      return n;
    }, 0);
    expect(count('LINE')).toBe(lines);
    expect(count('CIRCLE')).toBe(scene.prims.filter((p) => p.t === 'circle').length);
    expect(count('TEXT')).toBe(scene.prims.filter((p) => p.t === 'text').length);
    expect(Object.keys(parsed!.tables.layer.layers)).toEqual(
      expect.arrayContaining(['OUTLINE', 'DIM', 'DIM_EST', 'CENTRE', 'HIDDEN', 'TEXT', 'BORDER']),
    );
    for (const e of ents) {
      if (e.type === 'LINE') {
        const l = e as unknown as { vertices: { x: number; y: number }[] };
        for (const v of l.vertices) {
          expect(v.x).toBeGreaterThanOrEqual(-0.01);
          expect(v.x).toBeLessThanOrEqual(420.01);
          expect(v.y).toBeGreaterThanOrEqual(-0.01);
          expect(v.y).toBeLessThanOrEqual(297.01);
        }
      }
    }
    const texts = ents.filter((e) => e.type === 'TEXT').map((e) => (e as unknown as { text: string }).text);
    expect(texts.some((t) => t.includes('%%c'))).toBe(true); // diameter symbol survives R12
    expect(texts.every((t) => /^[\x20-\x7E]*$/.test(t))).toBe(true);
  });

  it('DXF has the y axis flipped to CAD convention (title block near the bottom)', () => {
    const parsed = new DxfParser().parseSync(sceneToDxf(scene))!;
    const t = parsed.entities.find((e) => e.type === 'TEXT' && (e as unknown as { text: string }).text.includes('GENERAL ARRANGEMENT')) as unknown as {
      startPoint: { y: number };
    };
    expect(t.startPoint.y).toBeLessThan(60);
  });
});

describe('snapshots of canonical designs', () => {
  const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
  it.each(PRESETS.filter((p) => ['sample-10t', 'bay-20t', 'yard-50t'].includes(p.id)))('$id', (p) => {
    const m = model(p.inputs);
    const scene = buildScene(m, META);
    expect({
      dims: m.dims.map((d) => [d.key, d.value, d.status]),
      scale: scene.sheetScale,
      views: scene.views.map((v) => [v.id, v.scale]),
      prims: scene.prims.length,
      svg: sha(sceneToSvg(scene)),
      dxf: sha(sceneToDxf(scene)),
    }).toMatchSnapshot();
  });
});
