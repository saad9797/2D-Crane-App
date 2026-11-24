import {
  DIN536,
  GRAVITY,
  RAIL_LOAD_LIMIT_KN,
  WHEEL_SERIES,
  type CraneType,
  type RailSection,
} from './constants';
import type { CraneInputs } from './schema';

/**
 * Parametric model: validated inputs -> derived dimensions with provenance.
 *
 * Every number below carries a rule ID (F-xx) from RESEARCH_NOTES.md §3 and a confidence.
 * Almost everything is an ESTIMATE: this is a layout/proposal tool, not a structural design check.
 * All lengths are millimetres, z is up with the rail top as datum (z = 0), y runs along the runway,
 * x runs along the bridge from the left rail centre-line (x = 0) to the right (x = span).
 */

export type DimStatus = 'input' | 'standard' | 'estimate';
export type Confidence = 'High' | 'Medium' | 'Low' | 'Estimate' | 'n/a';
export type PartId =
  | 'crane'
  | 'girder'
  | 'end-carriage'
  | 'wheel'
  | 'rail'
  | 'hoist'
  | 'hook'
  | 'floor';

export type DimGroup = 'Main' | 'Girder' | 'End carriage and wheels' | 'Hoist and hook' | 'Building clearances' | 'Loads and limits';

export interface DimInfo {
  key: string;
  label: string;
  value: number;
  unit: 'mm' | 'kN' | 't' | '';
  status: DimStatus;
  /** Symbolic rule. */
  formula: string;
  /** The same rule with this design's numbers substituted. */
  working: string;
  /** Rule ID(s) in RESEARCH_NOTES.md. */
  source: string;
  confidence: Confidence;
  part: PartId;
  group: DimGroup;
  /** Plain-language explanation shown in tooltips. */
  help: string;
}

export interface Assumption {
  id: string;
  text: string;
  source: string;
  confidence: Confidence;
}

export interface CraneModel {
  inputs: CraneInputs;
  type: CraneType;
  // inputs in mm / t
  spanMm: number;
  liftMm: number;
  capacityT: number;
  // girder
  depthRatio: number;
  girderDepth: number;
  girderWidth: number;
  girderSpacing: number; // double girder: centre-to-centre of the two girders; single: 0
  // end carriages
  wheelbase: number;
  wheelDia: number;
  wheelsPerEnd: 2 | 4;
  bogiePitch: number; // distance between the two wheels of a bogie (4-wheel ends), else 0
  endOverhang: number;
  overallLength: number;
  overallWidth: number;
  rail: { section: RailSection; headWidth: number; height: number; baseWidth: number; auto: boolean };
  // elevations (z up, rail top = 0)
  girderBottomZ: number;
  girderTopZ: number;
  hookHighZ: number;
  hookLowZ: number;
  floorZ: number;
  headroom: number; // highest point of the crane above rail top
  minRailHeightAboveFloor: number;
  // hoist
  hookApproach: number;
  usableTravel: number;
  trolleyX: number;
  hoistWheelbase: number;
  hoistLengthX: number; // plan size of trolley / crab along the bridge
  hoistWidthY: number; // plan size across the bridge
  hoistBodyHeight: number; // single girder: body hanging below girder bottom
  crabHeight: number; // double girder: height above girder top
  hoistHeadroom: number; // single girder: girder bottom to highest hook
  // loads
  craneMassT: number;
  endLoadKN: number;
  wheelLoadKN: number;
  deflectionLimit: number;
  camber: number;
  dims: DimInfo[];
  assumptions: Assumption[];
}

const ceilTo = (x: number, n: number): number => Math.ceil(x / n - 1e-9) * n;
const roundTo = (x: number, n: number): number => Math.round(x / n) * n;
const fmt = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export function deriveModel(inputs: CraneInputs): CraneModel {
  const Q = inputs.capacityT;
  const A = inputs.dutyGroup;
  const single = inputs.craneType === 'single-girder';
  const S = Math.round(inputs.spanM * 1000);
  const lift = Math.round(inputs.liftHeightM * 1000);
  const Sm = S / 1000;
  const dims: DimInfo[] = [];

  // --- masses and loads need a hook approach, which needs the hoist; derive hoist first (F-21) ---
  // F-21 (Low): single girder a = t_wb/2 + 450 with t_wb = 800 + 60 Q; double girder a = 600 + 10 Q.
  const hoistWheelbase = 800 + 60 * Q;
  const hookApproach = single ? roundTo(hoistWheelbase / 2 + 450, 10) : roundTo(600 + 10 * Q, 10);

  // F-10 (Low): mass fit to catalogue tables; single girder = 0.61 x double (sample calibration).
  const slope = 0.534 + 0.0103 * (Q - 10);
  const intercept = Math.max(0.4, 1.22 + 0.211 * (Q - 10));
  const massDouble = intercept + slope * Sm;
  const craneMassT = Math.max(0.5, (single ? 0.61 : 1) * massDouble);

  // F-11 (Estimate): hook at the approach limit + half the crane mass per end, statics only.
  const endLoadKN = Q * GRAVITY * ((S - hookApproach) / S) + (craneMassT * GRAVITY) / 2;

  // F-12 (Estimate): two wheels per end unless one would exceed 60 % of the largest catalogue wheel.
  const largest = WHEEL_SERIES[WHEEL_SERIES.length - 1]!;
  const allowKN = (w: { maxLoadT: number }): number => 0.6 * w.maxLoadT * GRAVITY;
  const wheelsPerEnd: 2 | 4 = endLoadKN / 2 <= allowKN(largest) ? 2 : 4;
  const wheelLoadKN = endLoadKN / wheelsPerEnd;

  // F-09 (Estimate): smallest standard diameter whose derated catalogue load covers the wheel load.
  const wheelPick = WHEEL_SERIES.find((w) => allowKN(w) >= wheelLoadKN) ?? largest;
  const wheelDia = wheelPick.diameter;

  // F-14 / F-13: rail section from the user's choice or the lightest rail whose limit covers the load.
  const railOrder: RailSection[] = ['A45', 'A55', 'A65', 'A75', 'A100'];
  const railAuto = inputs.railType === 'auto';
  const railSection: RailSection = railAuto
    ? (railOrder.find((r) => RAIL_LOAD_LIMIT_KN[r] >= wheelLoadKN) ?? 'A100')
    : (inputs.railType as RailSection);
  const railDims = DIN536[railSection];

  // F-04 (Estimate): wheelbase, never below CMAA 74 S/8 (F-03).
  const wMin = single ? 1500 + 50 * Q : 2800 + 40 * Q;
  const wheelbase = ceilTo(Math.max(S / 7, wMin), 50);

  // F-05 / F-06 (Estimate): girder depth from the Kino L/18..L/14 range plus a capacity floor.
  const depthRatio = 18 - (4 * (A - 1)) / 7;
  const hMin = single ? 600 + 40 * Q : 700 + 25 * Q;
  const girderDepth = ceilTo(Math.max(S / depthRatio, hMin), 50);
  // F-07 (Low): width from Kino B ~ H/3..H/2, >= L/50.
  const girderWidth = ceilTo(Math.max(girderDepth / 2.5, S / 50), 10);

  // F-22 (Low): spacing of the two girders.
  const girderSpacing = single ? 0 : ceilTo(1200 + 25 * Q, 50);

  // F-15 / F-16 (Estimate): calibrated to the sample drawing (25270 long, 4310 wide, wheelbase 3800, dia 250).
  const endOverhang = roundTo(wheelDia / 2 + 10, 5);
  const overallLength = S + 2 * endOverhang;
  const overallWidth = wheelbase + wheelDia + 260;
  const bogiePitch = wheelsPerEnd === 4 ? roundTo(1.6 * wheelDia, 10) : 0;

  // F-17 (Estimate): girder bottom sits below the rail top.
  const d = roundTo(wheelDia / 2 + 55, 5);
  const girderBottomZ = -d;
  const girderTopZ = girderDepth - d;

  // F-18 / F-19 / F-20: vertical envelope of hoist, hook and crab.
  const hoistHeadroom = single ? (inputs.lowHeadroomHoist ? 520 + 10 * Q : 1170 + 50 * Q) : 0;
  const hookHighZ = single ? girderBottomZ - hoistHeadroom : girderBottomZ - (100 + 10 * Q);
  const crabHeight = single ? 0 : 350 + 14 * Q;
  const hoistBodyHeight = single ? Math.round(hoistHeadroom * 0.55) : 0;
  const headroom = single ? girderTopZ : girderTopZ + crabHeight;
  const floorZ = hookHighZ - lift;
  const hookLowZ = floorZ;
  const minRailHeightAboveFloor = -floorZ;

  const usableTravel = S - 2 * hookApproach;
  const trolleyX = hookApproach + (usableTravel * inputs.trolleyPositionPct) / 100;
  const hoistLengthX = single ? hoistWheelbase + 400 : 1400 + 40 * Q;
  const hoistWidthY = single ? Math.max(girderWidth + 500, Math.round(0.9 * hoistWheelbase + 300)) : girderSpacing + girderWidth + 200;

  const deflectionLimit = S / 888;
  const camber = S / 1000;

  const add = (d: Omit<DimInfo, 'working'> & { working?: string }): void => {
    dims.push({ working: '', ...d });
  };

  // ---------------- dimension table (drives the panel and the sheet's technical data) ----------------
  add({
    key: 'span', label: 'Span (rail centre to rail centre)', value: S, unit: 'mm', status: 'input',
    formula: 'S = input', working: `S = ${S}`, source: 'IS 3177 Annex A', confidence: 'High', part: 'crane', group: 'Main',
    help: 'Distance between the centre-lines of the two runway rails. You choose this.',
  });
  add({
    key: 'overallLength', label: 'Overall length (over end carriages)', value: overallLength, unit: 'mm', status: 'estimate',
    formula: 'L = S + 2·e', working: `L = ${S} + 2·${endOverhang} = ${overallLength}`, source: 'F-15', confidence: 'Estimate', part: 'end-carriage', group: 'Main',
    help: 'How far the crane reaches past the two rails. The sample drawing is span + 270 mm.',
  });
  add({
    key: 'overallWidth', label: 'Overall width (along the runway)', value: overallWidth, unit: 'mm', status: 'estimate',
    formula: 'B = W + Ø + 260', working: `B = ${wheelbase} + ${wheelDia} + 260 = ${overallWidth}`, source: 'F-16', confidence: 'Estimate', part: 'end-carriage', group: 'Main',
    help: 'Length of one end carriage including wheels and buffers, measured along the runway.',
  });
  add({
    key: 'girderDepth', label: 'Girder depth', value: girderDepth, unit: 'mm', status: 'estimate',
    formula: 'h = ceil50( max( S / r , h_min ) ),  r = 18 − 4(A−1)/7',
    working: `r = ${fmt(depthRatio)}; h = ceil50(max(${S}/${fmt(depthRatio)}, ${hMin})) = ${girderDepth}`,
    source: 'F-05, F-06', confidence: 'Estimate', part: 'girder', group: 'Girder',
    help: 'Height of the main girder. Heavier duty groups get a deeper (stiffer) girder. A proportioning rule of thumb, not a structural check.',
  });
  add({
    key: 'girderWidth', label: 'Girder width', value: girderWidth, unit: 'mm', status: 'estimate',
    formula: 'b = ceil10( max( h / 2.5 , S / 50 ) )', working: `b = ceil10(max(${girderDepth}/2.5, ${S}/50)) = ${girderWidth}`,
    source: 'F-07', confidence: 'Low', part: 'girder', group: 'Girder',
    help: 'Width of the box girder. Kino Cranes suggests H/3 to H/2 and at least span/50.',
  });
  if (!single) {
    add({
      key: 'girderSpacing', label: 'Girder spacing (centre to centre)', value: girderSpacing, unit: 'mm', status: 'estimate',
      formula: 'K = ceil50( 1200 + 25·Q )', working: `K = ceil50(1200 + 25·${Q}) = ${girderSpacing}`,
      source: 'F-22', confidence: 'Low', part: 'girder', group: 'Girder',
      help: 'Distance between the two main girders; also the trolley track gauge.',
    });
  }
  add({
    key: 'deflectionLimit', label: 'Allowable girder deflection', value: Math.round(deflectionLimit), unit: 'mm', status: 'standard',
    formula: 'δ_max = S / 888', working: `δ_max = ${S}/888 = ${deflectionLimit.toFixed(1)}`,
    source: 'F-08', confidence: 'High', part: 'girder', group: 'Girder',
    help: 'CMAA 70 limit for rated load plus trolley, as quoted by CMAA. Other codes use S/750–S/1000. Information only: this tool does not check stiffness.',
  });
  add({
    key: 'camber', label: 'Suggested camber', value: Math.round(camber), unit: 'mm', status: 'estimate',
    formula: 'camber ≈ S / 1000', working: `camber ≈ ${S}/1000 = ${camber.toFixed(1)}`,
    source: 'F-08', confidence: 'Low', part: 'girder', group: 'Girder',
    help: 'Upward pre-bend so the girder is level under dead load (Kino Cranes rule of thumb). Not drawn.',
  });
  add({
    key: 'wheelbase', label: 'Wheelbase (outer wheel centres)', value: wheelbase, unit: 'mm', status: 'estimate',
    formula: 'W = ceil50( max( S / 7 , W_min ) ),  W ≥ S / 8',
    working: `W = ceil50(max(${S}/7, ${wMin})) = ${wheelbase}  (CMAA 74 floor S/8 = ${Math.round(S / 8)})`,
    source: 'F-03, F-04', confidence: 'Estimate', part: 'end-carriage', group: 'End carriage and wheels',
    help: 'Distance between the outer wheels of one end carriage. A longer wheelbase resists skewing; CMAA 74 requires at least span/8.',
  });
  add({
    key: 'wheelDia', label: 'Wheel tread diameter', value: wheelDia, unit: 'mm', status: 'estimate',
    formula: 'smallest IS 3177 size with 0.6 × catalogue load ≥ wheel load',
    working: `${wheelLoadKN.toFixed(0)} kN → Ø${wheelDia} (limit ${allowKN(wheelPick).toFixed(0)} kN)`,
    source: 'F-09', confidence: 'Estimate', part: 'wheel', group: 'End carriage and wheels',
    help: 'Chosen from the standard IS 3177 wheel sizes (160, 200, 250, 315, 400, 500) using the estimated wheel load.',
  });
  add({
    key: 'wheelsPerEnd', label: 'Wheels per end carriage', value: wheelsPerEnd, unit: '', status: 'estimate',
    formula: '2, or 4 (bogie) if a single wheel would exceed 60 % of the largest size',
    working: `end load ${endLoadKN.toFixed(0)} kN → ${wheelsPerEnd} wheels`, source: 'F-12', confidence: 'Estimate', part: 'wheel', group: 'End carriage and wheels',
    help: 'Very heavy cranes spread the load over two wheel pairs per end.',
  });
  add({
    key: 'endOverhang', label: 'End overhang beyond rail centre', value: endOverhang, unit: 'mm', status: 'estimate',
    formula: 'e = Ø / 2 + 10', working: `e = ${wheelDia}/2 + 10 = ${endOverhang}`, source: 'F-15', confidence: 'Estimate', part: 'end-carriage', group: 'End carriage and wheels',
    help: 'How far each end carriage extends beyond the rail centre-line. Calibrated to the sample (135 mm per side).',
  });
  add({
    key: 'railHead', label: `Rail head width (DIN 536 ${railSection})`, value: railDims.headWidth, unit: 'mm', status: railAuto ? 'estimate' : 'standard',
    formula: railAuto ? 'lightest DIN 536 rail whose load limit ≥ wheel load' : 'DIN 536 section chosen by you',
    working: `${railSection}: head ${railDims.headWidth}, height ${railDims.height}, base ${railDims.baseWidth} (limit ${RAIL_LOAD_LIMIT_KN[railSection]} kN)`,
    source: railAuto ? 'F-13, F-14' : 'F-14', confidence: railAuto ? 'Low' : 'Medium', part: 'rail', group: 'End carriage and wheels',
    help: railAuto ? 'Rail chosen automatically from the wheel load using a blog-sourced load table. Override it if your runway is fixed.' : 'Dimensions of the DIN 536 section you chose.',
  });
  add({
    key: 'girderBottom', label: 'Girder underside below rail top', value: d, unit: 'mm', status: 'estimate',
    formula: 'd = Ø / 2 + 55', working: `d = ${wheelDia}/2 + 55 = ${d}`, source: 'F-17', confidence: 'Estimate', part: 'girder', group: 'Building clearances',
    help: 'The girder hangs slightly below the rail top between the end carriages.',
  });
  add({
    key: 'headroom', label: 'Headroom (rail top to highest point of crane)', value: headroom, unit: 'mm', status: 'estimate',
    formula: single ? 'H = h − d' : 'H = h − d + crab height', working: single ? `H = ${girderDepth} − ${d} = ${headroom}` : `H = ${girderDepth} − ${d} + ${crabHeight} = ${headroom}`,
    source: single ? 'F-06, F-17' : 'F-06, F-17, F-20', confidence: 'Estimate', part: 'crane', group: 'Building clearances',
    help: 'Clear height the building needs above the rail top. Check this against your roof truss or the soffit.',
  });
  add({
    key: 'hookOffset', label: 'Rail top to hook (highest position)', value: -hookHighZ, unit: 'mm', status: 'estimate',
    formula: single ? 'd + hoist headroom' : 'd + 100 + 10·Q',
    working: single ? `${d} + ${hoistHeadroom} = ${-hookHighZ}` : `${d} + 100 + 10·${Q} = ${-hookHighZ}`,
    source: single ? 'F-18' : 'F-19', confidence: single && !inputs.lowHeadroomHoist ? 'Low' : 'Estimate', part: 'hook', group: 'Building clearances',
    help: single
      ? 'How far below the rail top the hook sits when fully raised. A low-headroom hoist keeps the hook higher.'
      : 'The hook rises between the two girders, so it can get closer to the rail top than on a single girder.',
  });
  add({
    key: 'liftHeight', label: 'Lift height (hook travel)', value: lift, unit: 'mm', status: 'input',
    formula: 'H_L = input', working: `H_L = ${lift}`, source: 'IS 3177 Annex E-3', confidence: 'High', part: 'hook', group: 'Hoist and hook',
    help: 'Distance the hook travels from its highest to its lowest position.',
  });
  add({
    key: 'minRailHeight', label: 'Minimum rail top height above floor', value: minRailHeightAboveFloor, unit: 'mm', status: 'estimate',
    formula: 'lift + rail top to hook (highest)', working: `${lift} + ${-hookHighZ} = ${minRailHeightAboveFloor}`,
    source: 'F-24', confidence: 'Estimate', part: 'floor', group: 'Building clearances',
    help: 'How high the runway rail must be above the floor to give this lift height.',
  });
  add({
    key: 'hookApproach', label: 'Hook approach (min., each side)', value: hookApproach, unit: 'mm', status: 'estimate',
    formula: single ? 'a = t_wb / 2 + 450,  t_wb = 800 + 60·Q' : 'a = 600 + 10·Q',
    working: single ? `a = ${hoistWheelbase}/2 + 450 = ${hookApproach}` : `a = 600 + 10·${Q} = ${hookApproach}`,
    source: 'F-21', confidence: 'Low', part: 'hook', group: 'Hoist and hook',
    help: 'Closest the hook can get to the rail centre-line. Sources disagree widely for double girders (300–1200 mm): confirm with the hoist maker.',
  });
  add({
    key: 'usableTravel', label: 'Hook travel along the bridge', value: usableTravel, unit: 'mm', status: 'estimate',
    formula: 'S − 2a', working: `${S} − 2·${hookApproach} = ${usableTravel}`, source: 'F-21', confidence: 'Estimate', part: 'hook', group: 'Hoist and hook',
    help: 'How far the hook can move between its two end stops.',
  });
  add({
    key: 'craneMass', label: 'Crane mass incl. trolley (approx.)', value: Number(craneMassT.toFixed(1)), unit: 't', status: 'estimate',
    formula: 'm = f(Q, S); single girder = 0.61 × double', working: `${craneMassT.toFixed(1)} t`, source: 'F-10', confidence: 'Low', part: 'crane', group: 'Loads and limits',
    help: 'Rough mass from a fit to two manufacturer tables. Do not quote it: ask for the real figure.',
  });
  add({
    key: 'wheelLoad', label: 'Max static wheel load (approx.)', value: Number(wheelLoadKN.toFixed(1)), unit: 'kN', status: 'estimate',
    formula: 'R = ( Q·g·(S−a)/S + m·g/2 ) / n_wheels', working: `( ${Q}·9.81·(${S}−${hookApproach})/${S} + ${craneMassT.toFixed(1)}·9.81/2 ) / ${wheelsPerEnd} = ${wheelLoadKN.toFixed(1)} kN`,
    source: 'F-11', confidence: 'Estimate', part: 'wheel', group: 'Loads and limits',
    help: 'Static load on the most heavily loaded wheel with the hook at its end stop. No dynamic factors.',
  });

  const assumptions: Assumption[] = [
    { id: 'A1', text: 'Component outlines (hoist, trolley, hook, end carriage, runway beam) are schematic. Only the printed dimensions are modelled.', source: 'RESEARCH_NOTES §3(c)', confidence: 'n/a' },
    { id: 'A2', text: 'Hook approach is the same on both sides. The sample drawing shows 920 mm left and 1150 mm right.', source: 'F-21', confidence: 'Low' },
    { id: 'A3', text: 'Top-running crane on runway rails. No cab, under-running, gantry or second hoist.', source: 'RESEARCH_NOTES §3(c)', confidence: 'n/a' },
    { id: 'A4', text: 'The hook is assumed to reach floor level at its lowest position.', source: 'F-23', confidence: 'Estimate' },
    { id: 'A5', text: 'Girder depth, width, masses and loads are proportioning heuristics, not a design check: the structure still needs calculating to your standard.', source: 'F-05 to F-11', confidence: 'Estimate' },
    {
      id: 'A6',
      text: railAuto
        ? `Rail auto-selected as DIN 536 ${railSection} from the estimated wheel load of ${wheelLoadKN.toFixed(0)} kN using a blog-sourced load table (not a standard).`
        : `Rail DIN 536 ${railSection} chosen by you; check its load limit (${RAIL_LOAD_LIMIT_KN[railSection]} kN) against the real wheel load.`,
      source: 'F-13', confidence: 'Low',
    },
  ];

  return {
    inputs,
    type: inputs.craneType,
    spanMm: S,
    liftMm: lift,
    capacityT: Q,
    depthRatio,
    girderDepth,
    girderWidth,
    girderSpacing,
    wheelbase,
    wheelDia,
    wheelsPerEnd,
    bogiePitch,
    endOverhang,
    overallLength,
    overallWidth,
    rail: { section: railSection, headWidth: railDims.headWidth, height: railDims.height, baseWidth: railDims.baseWidth, auto: railAuto },
    girderBottomZ,
    girderTopZ,
    hookHighZ,
    hookLowZ,
    floorZ,
    headroom,
    minRailHeightAboveFloor,
    hookApproach,
    usableTravel,
    trolleyX,
    hoistWheelbase,
    hoistLengthX,
    hoistWidthY,
    hoistBodyHeight,
    crabHeight,
    hoistHeadroom,
    craneMassT,
    endLoadKN,
    wheelLoadKN,
    deflectionLimit,
    camber,
    dims,
    assumptions,
  };
}

