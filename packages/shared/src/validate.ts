import { RAIL_LOAD_LIMIT_KN, WHEEL_SERIES, GRAVITY } from './constants';
import { deriveModel, type CraneModel } from './model';
import { craneInputsSchema, zodToIssues, type CraneInputs, type Issue } from './schema';

/**
 * Two validation tiers.
 *  - errors block saving and rendering (impossible, unsafe or out-of-envelope geometry);
 *  - warnings allow saving but are shown (unusual but valid).
 * Envelope numbers are F-02 in RESEARCH_NOTES.md (vendor ranges, Medium confidence).
 */

const err = (path: string, code: string, message: string, hint?: string): Issue => ({ path, severity: 'error', code, message, ...(hint ? { hint } : {}) });
const warn = (path: string, code: string, message: string, hint?: string): Issue => ({ path, severity: 'warning', code, message, ...(hint ? { hint } : {}) });

/** Cross-field rules that need only the inputs. */
export function validateInputs(i: CraneInputs): Issue[] {
  const out: Issue[] = [];
  const single = i.craneType === 'single-girder';

  if (single) {
    if (i.capacityT > 20) {
      out.push(err('capacityT', 'single_capacity_max', `A single-girder crane is limited to 20 t here (you chose ${i.capacityT} t).`, 'Reduce the capacity to 20 t or less, or switch to a double-girder crane.'));
    }
    if (i.spanM > 31.5) {
      out.push(err('spanM', 'single_span_max', `A single-girder crane is limited to a 31.5 m span here (you chose ${i.spanM} m).`, 'Reduce the span to 31.5 m or less, or switch to a double-girder crane.'));
    }
    if (i.capacityT <= 20 && i.capacityT > 16) {
      out.push(warn('capacityT', 'single_capacity_high', `${i.capacityT} t is at the top of what single-girder cranes usually carry.`, 'A double-girder crane is more common above 16 t.'));
    }
    if (i.spanM <= 31.5 && i.spanM > 25) {
      out.push(warn('spanM', 'single_span_long', `A ${i.spanM} m span is long for a single girder; deflection usually pushes designs to double girder.`, 'Consider a double-girder crane.'));
    }
    if (i.dutyGroup >= 7) {
      out.push(warn('dutyGroup', 'single_duty_heavy', `Group A${i.dutyGroup} is very intensive; single-girder cranes are usually supplied for A3–A4 (vendor practice).`, 'Check this combination with your engineering team.'));
    }
    if (i.liftHeightM > 18) {
      out.push(warn('liftHeightM', 'single_lift_high', `A ${i.liftHeightM} m lift is above the usual 6–18 m for single-girder hoists.`));
    }
  } else {
    if (i.capacityT > 50) {
      out.push(err('capacityT', 'double_capacity_max', 'Capacity above 50 t is outside this tool.'));
    }
    if (i.capacityT < 5) {
      out.push(warn('capacityT', 'double_capacity_low', `A double-girder crane below 5 t is unusual (${i.capacityT} t).`, 'A single-girder crane is normally chosen for this capacity.'));
    }
    if (i.lowHeadroomHoist) {
      out.push(err('lowHeadroomHoist', 'low_headroom_single_only', 'The low-headroom hoist option only applies to single-girder cranes.', 'Turn it off, or switch to a single-girder crane.'));
    }
  }

  if (i.spanM < 7.5) {
    out.push(warn('spanM', 'span_short', `A span of ${i.spanM} m is shorter than the usual 7.5 m minimum in catalogues.`));
  }
  return out;
}

/** Rules that need the derived geometry. */
export function checkModel(m: CraneModel): Issue[] {
  const out: Issue[] = [];
  if (m.usableTravel < 1000) {
    out.push(
      err(
        'spanM',
        'span_too_short_for_hoist',
        `Only ${Math.round(m.usableTravel)} mm of hook travel is left: the hoist's hook approach (${m.hookApproach} mm each side) takes most of the ${m.spanMm} mm span.`,
        'Increase the span or reduce the capacity.',
      ),
    );
  }
  const largest = WHEEL_SERIES[WHEEL_SERIES.length - 1]!;
  if (m.wheelLoadKN > 0.6 * largest.maxLoadT * GRAVITY) {
    out.push(err('capacityT', 'wheel_load_too_high', `Estimated wheel load ${m.wheelLoadKN.toFixed(0)} kN exceeds the largest wheel in this model.`, 'Reduce the span or capacity.'));
  }
  const limit = RAIL_LOAD_LIMIT_KN[m.rail.section];
  if (m.wheelLoadKN > limit) {
    out.push(
      warn(
        'railType',
        'rail_undersized',
        `DIN 536 ${m.rail.section} is rated for about ${limit} kN (blog table) but the estimated wheel load is ${m.wheelLoadKN.toFixed(0)} kN.`,
        'Choose a heavier rail, or leave the rail on Auto.',
      ),
    );
  }
  return out;
}

export interface Analysis {
  ok: boolean;
  issues: Issue[];
  inputs?: CraneInputs;
  model?: CraneModel;
}

/**
 * The single entry point used by the web editor (live preview) and by the API (authoritative).
 * `ok` is false when there is any error-severity issue; `model` is only present when ok.
 */
export function analyze(raw: unknown): Analysis {
  const parsed = craneInputsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: zodToIssues(parsed.error) };
  const inputs = parsed.data;
  const issues = validateInputs(inputs);
  if (issues.some((x) => x.severity === 'error')) return { ok: false, issues, inputs };
  const model = deriveModel(inputs);
  issues.push(...checkModel(model));
  const ok = !issues.some((x) => x.severity === 'error');
  return ok ? { ok, issues, inputs, model } : { ok, issues, inputs };
}

export const hasErrors = (issues: Issue[]): boolean => issues.some((x) => x.severity === 'error');
