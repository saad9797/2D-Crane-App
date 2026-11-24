import { DEFAULT_INPUTS, PRESETS, type CraneInputs } from '@crane/shared';
import type { Design } from '../api/client';

/** What the user is editing. */
export interface Doc {
  name: string;
  notes: string;
  inputs: CraneInputs;
}

export interface Baseline {
  doc: Doc;
  /** null until the design has been saved once. */
  id: string | null;
  revision: number | null;
  updatedAt: string | null;
}

export const NEW_NAME = 'Untitled crane';

export function newDoc(presetId?: string | null): Doc {
  const preset = PRESETS.find((p) => p.id === presetId);
  return { name: preset ? preset.label : NEW_NAME, notes: '', inputs: { ...(preset?.inputs ?? DEFAULT_INPUTS) } };
}

export const docFromDesign = (d: Design): Doc => ({ name: d.name, notes: d.notes, inputs: d.inputs });

export const baselineFromDesign = (d: Design): Baseline => ({ doc: docFromDesign(d), id: d.id, revision: d.revision, updatedAt: d.updatedAt });

const numEq = (a: number, b: number): boolean => a === b || (Number.isNaN(a) && Number.isNaN(b));

export function sameDoc(a: Doc, b: Doc): boolean {
  if (a.name !== b.name || a.notes !== b.notes) return false;
  const keys = Object.keys(a.inputs) as (keyof CraneInputs)[];
  return keys.every((k) => {
    const x = a.inputs[k];
    const y = b.inputs[k];
    return typeof x === 'number' && typeof y === 'number' ? numEq(x, y) : x === y;
  });
}

// ---- session draft: survives an expired login or an accidental reload ----
const draftKey = (id: string | null): string => `crane.draft.${id ?? 'new'}`;

export function saveDraft(id: string | null, doc: Doc): void {
  try {
    sessionStorage.setItem(draftKey(id), JSON.stringify(doc, (_k, v: unknown) => (typeof v === 'number' && Number.isNaN(v) ? '__NaN__' : v)));
  } catch {
    /* storage unavailable */
  }
}

export function loadDraft(id: string | null): Doc | null {
  try {
    const raw = sessionStorage.getItem(draftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw, (_k, v: unknown) => (v === '__NaN__' ? Number.NaN : v)) as Doc;
    return parsed && typeof parsed.name === 'string' && parsed.inputs ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft(id: string | null): void {
  try {
    sessionStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
}
