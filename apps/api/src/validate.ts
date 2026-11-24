import type { z } from 'zod';
import { analyze, hasErrors, zodToIssues, type Analysis, type Issue } from '@crane/shared';
import { ApiError } from './errors';

/** Parse a request part with a Zod schema; failures become a 400 with per-field issues. */
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError(400, 'validation_failed', 'The request is not valid.', zodToIssues(r.error));
  return r.data as z.infer<S>;
}

export type ValidAnalysis = Required<Pick<Analysis, 'inputs' | 'model'>> & Analysis;

/**
 * Engineering validation (cross-field rules). Shape errors are rejected earlier as 400 by `parse`;
 * rule violations on well-formed input are 422. Warnings are returned for the caller to pass on.
 */
export function requireValidDesign(rawInputs: unknown): { analysis: ValidAnalysis; warnings: Issue[] } {
  const analysis = analyze(rawInputs);
  if (hasErrors(analysis.issues) || !analysis.inputs || !analysis.model) {
    throw new ApiError(422, 'design_rules_violated', 'These inputs break an engineering rule. Fix the highlighted fields.', analysis.issues);
  }
  return { analysis: analysis as ValidAnalysis, warnings: analysis.issues.filter((i) => i.severity === 'warning') };
}
