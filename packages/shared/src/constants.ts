/**
 * Fixed vocabularies and limits shared by the API, the web app and the engine.
 * Rule IDs (F-xx) refer to the formula table in RESEARCH_NOTES.md.
 */

/** F-01 — IS 3177:1999 Annex E-2, preferred series R10 (tonnes), up to the 50 t this app covers. */
export const CAPACITY_SERIES_T = [
  1, 1.25, 1.6, 2, 2.5, 3.2, 4, 5, 6.3, 8, 10, 12.5, 16, 20, 25, 32, 40, 50,
] as const;

export const CRANE_TYPES = ['double-girder', 'single-girder'] as const;
export type CraneType = (typeof CRANE_TYPES)[number];

export const CRANE_TYPE_LABEL: Record<CraneType, string> = {
  'double-girder': 'Double girder, top-running',
  'single-girder': 'Single girder, top-running',
};

export const DUTY_GROUPS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Plain-language duty descriptors — alwahacranes.com summary of FEM A1–A8 (RESEARCH_NOTES §2.2, Low). */
export const DUTY_DESCRIPTION: Record<number, string> = {
  1: 'Light, occasional use',
  2: 'Light, occasional use',
  3: 'Moderate service',
  4: 'Moderate service',
  5: 'Regular, intensive service',
  6: 'Regular, intensive service',
  7: 'Very intensive, continuous',
  8: 'Very intensive, continuous',
};

export const RAIL_TYPES = ['auto', 'A45', 'A55', 'A65', 'A75', 'A100'] as const;
export type RailType = (typeof RAIL_TYPES)[number];
export type RailSection = Exclude<RailType, 'auto'>;

/** F-14 — DIN 536 section (wirthrail.com), mm. */
export const DIN536: Record<RailSection, { headWidth: number; height: number; baseWidth: number; kgPerM: number }> = {
  A45: { headWidth: 45, height: 55, baseWidth: 125, kgPerM: 22.1 },
  A55: { headWidth: 55, height: 65, baseWidth: 150, kgPerM: 31.8 },
  A65: { headWidth: 65, height: 75, baseWidth: 175, kgPerM: 43.1 },
  A75: { headWidth: 75, height: 85, baseWidth: 200, kgPerM: 56.2 },
  A100: { headWidth: 100, height: 95, baseWidth: 200, kgPerM: 74.3 },
};

/** F-13 — eotconnect.com wheel-load table (the blog's own, Low confidence), kN. */
export const RAIL_LOAD_LIMIT_KN: Record<RailSection, number> = {
  A45: 100,
  A55: 150,
  A65: 200,
  A75: 260,
  A100: 380,
};

/**
 * F-09 — standard tread diameters from IS 3177 cl. 8.6.6 (160…500 used here) with the Demag DRS
 * catalogue "max load per wheel" in tonnes (RESEARCH_NOTES §2.3).
 */
export const WHEEL_SERIES = [
  { diameter: 160, maxLoadT: 7 },
  { diameter: 200, maxLoadT: 10 },
  { diameter: 250, maxLoadT: 16 },
  { diameter: 315, maxLoadT: 22 },
  { diameter: 400, maxLoadT: 30 },
  { diameter: 500, maxLoadT: 40 },
] as const;

export const GRAVITY = 9.81;

/** Hard input ranges. Type-specific envelopes (F-02) live in validate.ts. */
export const LIMITS = {
  spanM: { min: 5, max: 35, step: 0.1 },
  liftHeightM: { min: 2, max: 30, step: 0.1 },
  trolleyPositionPct: { min: 0, max: 100, step: 1 },
  dutyGroup: { min: 1, max: 8, step: 1 },
} as const;

export const SCHEMA_VERSION = 1;
export const NAME_MAX = 120;
export const NOTES_MAX = 2000;

/** Demo account created by `npm run db:seed`; shown on the login page. Public by design. */
export const DEMO_USER = { email: 'demo@example.com', password: 'CraneDemo2026!' } as const;
