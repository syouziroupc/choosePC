import { ENGINE_VERSION, evaluatePc as evaluatePcBase } from "./evaluation";
import type { EvaluationInput, EvaluationResult } from "./types";

/**
 * Public evaluation entry point.
 *
 * The active engine version is owned by the engine itself. Callers may still
 * carry an older engineVersion field for compatibility, but it must never be
 * able to relabel a result produced by the current implementation.
 */
export function evaluatePc(input: EvaluationInput): EvaluationResult {
  return evaluatePcBase({ ...input, engineVersion: ENGINE_VERSION });
}
