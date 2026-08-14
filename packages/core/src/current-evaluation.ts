import { ENGINE_VERSION, evaluatePc as evaluatePcBase } from "./evaluation";
import { KNOWLEDGE_VERSION } from "./knowledge";
import type { EvaluationInput, EvaluationResult } from "./types";

/**
 * Public evaluation entry point.
 *
 * Engine and knowledge versions are owned by the active implementation.
 * Callers may carry stale version fields for compatibility, but they cannot
 * relabel a result produced by the current code or knowledge corpus.
 */
export function evaluatePc(input: EvaluationInput): EvaluationResult {
  return evaluatePcBase({
    ...input,
    engineVersion: ENGINE_VERSION,
    knowledgeVersion: KNOWLEDGE_VERSION,
  });
}
