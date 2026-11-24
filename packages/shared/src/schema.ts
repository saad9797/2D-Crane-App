import { z } from 'zod';
import {
  CAPACITY_SERIES_T,
  CRANE_TYPES,
  LIMITS,
  NAME_MAX,
  NOTES_MAX,
  RAIL_TYPES,
  SCHEMA_VERSION,
} from './constants';

/** One validation finding. `path` is the input field (dot path) so the UI can highlight it. */
export interface Issue {
  path: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** How to fix it, in plain language. */
  hint?: string;
}

const stepOk = (v: number, step: number): boolean => Math.abs(v / step - Math.round(v / step)) < 1e-6;

function numberField(label: string, unit: string, min: number, max: number, step: number) {
  return z
    .number({
      required_error: `${label} is required.`,
      invalid_type_error: `${label} must be a number (received something else).`,
    })
    .finite(`${label} must be a finite number.`)
    .min(min, `${label} must be at least ${min} ${unit}.`)
    .max(max, `${label} must be at most ${max} ${unit}.`)
    .refine((v) => stepOk(v, step), `${label} must be in steps of ${step} ${unit}.`);
}

function enumField<const T extends readonly [string, ...string[]]>(label: string, values: T) {
  return z.enum(values, { errorMap: () => ({ message: `${label} must be one of: ${values.join(', ')}.` }) });
}

export const craneInputsSchema = z
  .object({
    craneType: enumField('Crane type', CRANE_TYPES),
    capacityT: z
      .number({ required_error: 'Capacity is required.', invalid_type_error: 'Capacity must be a number.' })
      .refine((v) => (CAPACITY_SERIES_T as readonly number[]).includes(v), {
        message: `Capacity must be a standard value: ${CAPACITY_SERIES_T.join(', ')} t.`,
      }),
    dutyGroup: numberField('Duty group', '', LIMITS.dutyGroup.min, LIMITS.dutyGroup.max, 1),
    spanM: numberField('Span', 'm', LIMITS.spanM.min, LIMITS.spanM.max, LIMITS.spanM.step),
    liftHeightM: numberField('Lift height', 'm', LIMITS.liftHeightM.min, LIMITS.liftHeightM.max, LIMITS.liftHeightM.step),
    trolleyPositionPct: numberField('Trolley position', '%', LIMITS.trolleyPositionPct.min, LIMITS.trolleyPositionPct.max, 1),
    lowHeadroomHoist: z.boolean({
      required_error: 'Low-headroom option is required.',
      invalid_type_error: 'Low-headroom option must be true or false.',
    }),
    railType: enumField('Rail type', RAIL_TYPES),
  })
  .strict();

export type CraneInputs = z.infer<typeof craneInputsSchema>;

export const DEFAULT_INPUTS: CraneInputs = {
  craneType: 'double-girder',
  capacityT: 10,
  dutyGroup: 5,
  spanM: 18,
  liftHeightM: 9,
  trolleyPositionPct: 50,
  lowHeadroomHoist: false,
  railType: 'auto',
};

export interface Preset {
  id: string;
  label: string;
  description: string;
  inputs: CraneInputs;
}

export const PRESETS: Preset[] = [
  {
    id: 'workshop-5t',
    label: '5 t × 15 m workshop crane',
    description: 'Light single-girder bay crane for a fabrication shop.',
    inputs: { craneType: 'single-girder', capacityT: 5, dutyGroup: 4, spanM: 15, liftHeightM: 6.3, trolleyPositionPct: 50, lowHeadroomHoist: false, railType: 'auto' },
  },
  {
    id: 'sample-10t',
    label: '10 t × 25 m (like the sample drawing)',
    description: 'Single girder, low-headroom hoist, group A5 — the company sample.',
    inputs: { craneType: 'single-girder', capacityT: 10, dutyGroup: 5, spanM: 25, liftHeightM: 7.9, trolleyPositionPct: 50, lowHeadroomHoist: true, railType: 'auto' },
  },
  {
    id: 'bay-20t',
    label: '20 t × 18 m double girder',
    description: 'General-purpose heavy bay crane.',
    inputs: { craneType: 'double-girder', capacityT: 20, dutyGroup: 5, spanM: 18, liftHeightM: 9, trolleyPositionPct: 50, lowHeadroomHoist: false, railType: 'auto' },
  },
  {
    id: 'steel-32t',
    label: '32 t × 24 m heavy duty',
    description: 'Intensive-duty double girder for a steel store or press shop.',
    inputs: { craneType: 'double-girder', capacityT: 32, dutyGroup: 6, spanM: 24, liftHeightM: 12, trolleyPositionPct: 50, lowHeadroomHoist: false, railType: 'auto' },
  },
  {
    id: 'yard-50t',
    label: '50 t × 30 m maximum',
    description: 'Upper end of what this tool covers.',
    inputs: { craneType: 'double-girder', capacityT: 50, dutyGroup: 6, spanM: 30, liftHeightM: 12, trolleyPositionPct: 50, lowHeadroomHoist: false, railType: 'auto' },
  },
];

/** Strip control / zero-width / bidi-override characters; keep everything else as plain text. */
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export const cleanSingleLine = (s: string): string => s.replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim();
export const cleanMultiLine = (s: string): string => s.replace(UNSAFE_CHARS, '').replace(/\r\n?/g, '\n').trim();

export const designNameSchema = z
  .string({ required_error: 'Name is required.', invalid_type_error: 'Name must be text.' })
  .transform(cleanSingleLine)
  .refine((s) => s.length >= 1, 'Name cannot be empty.')
  .refine((s) => s.length <= NAME_MAX, `Name must be at most ${NAME_MAX} characters.`);

export const designNotesSchema = z
  .string({ invalid_type_error: 'Notes must be text.' })
  .transform(cleanMultiLine)
  .refine((s) => s.length <= NOTES_MAX, `Notes must be at most ${NOTES_MAX} characters.`);

export const designCreateSchema = z
  .object({
    name: designNameSchema,
    notes: designNotesSchema.default(''),
    inputs: craneInputsSchema,
  })
  .strict();
export type DesignCreate = z.infer<typeof designCreateSchema>;

/** `revision` is the optimistic-concurrency token the client last saw. */
export const designUpdateSchema = z
  .object({
    name: designNameSchema,
    notes: designNotesSchema.default(''),
    inputs: craneInputsSchema,
    revision: z
      .number({ required_error: 'Revision is required (send the revision you last loaded).', invalid_type_error: 'Revision must be a number.' })
      .int('Revision must be a whole number.')
      .min(1, 'Revision must be at least 1.'),
  })
  .strict();
export type DesignUpdate = z.infer<typeof designUpdateSchema>;

export const renderRequestSchema = z.object({ inputs: craneInputsSchema }).strict();

export const exportRequestSchema = z
  .object({
    inputs: craneInputsSchema,
    name: designNameSchema.default('Untitled crane'),
    revision: z.number().int().min(1).max(100000).default(1),
  })
  .strict();

export const registerSchema = z
  .object({
    email: z
      .string({ required_error: 'Email is required.', invalid_type_error: 'Email must be text.' })
      .trim()
      .toLowerCase()
      .email('Enter a valid email address.')
      .max(254, 'Email is too long.'),
    password: z
      .string({ required_error: 'Password is required.', invalid_type_error: 'Password must be text.' })
      .min(8, 'Password must be at least 8 characters.')
      .max(72, 'Password must be at most 72 characters.'),
    displayName: z
      .string({ invalid_type_error: 'Display name must be text.' })
      .transform(cleanSingleLine)
      .refine((s) => s.length <= 60, 'Display name must be at most 60 characters.')
      .optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string({ required_error: 'Email is required.' }).trim().toLowerCase().max(254),
    password: z.string({ required_error: 'Password is required.' }).min(1, 'Password is required.').max(72),
  })
  .strict();

export const listQuerySchema = z
  .object({
    q: z.string().max(100).optional(),
    sort: z.enum(['updatedAt', 'createdAt', 'name', 'capacityT', 'spanM']).default('updatedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();

/** Convert a Zod error into path-addressed issues. */
export function zodToIssues(error: z.ZodError): Issue[] {
  const out: Issue[] = [];
  for (const i of error.issues) {
    if (i.code === 'unrecognized_keys') {
      for (const key of i.keys) {
        out.push({
          path: [...i.path, key].join('.'),
          severity: 'error',
          code: 'unknown_field',
          message: `Unknown field "${key}".`,
          hint: 'Remove it; only documented fields are accepted.',
        });
      }
      continue;
    }
    out.push({ path: i.path.join('.'), severity: 'error', code: i.code, message: i.message });
  }
  return out;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export function parseInputs(raw: unknown): ParseResult<CraneInputs> {
  const r = craneInputsSchema.safeParse(raw);
  return r.success ? { ok: true, value: r.data } : { ok: false, issues: zodToIssues(r.error) };
}

export { SCHEMA_VERSION };
