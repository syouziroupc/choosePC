import type { Decision, EvaluationResult } from "./types";

export interface CandidateEvaluation { candidateId: string; result: EvaluationResult }
const decisionTier: Record<Decision, number> = { strong_buy: 6, buy: 5, fair: 4, overpriced: 3, insufficient_data: 2, avoid: 1 };

/** Ranking is purely evaluative. Merchant identity, affiliate rates and own-stock status are intentionally not accepted. */
export function rankCandidates(candidates: readonly CandidateEvaluation[]): CandidateEvaluation[] {
  return [...candidates].sort((a, b) => {
    const tier = decisionTier[b.result.decision] - decisionTier[a.result.decision];
    if (tier !== 0) return tier;
    const overall = b.result.scores.overall - a.result.scores.overall;
    if (Math.abs(overall) > 0.001) return overall;
    const fit = b.result.scores.fit - a.result.scores.fit;
    if (Math.abs(fit) > 0.001) return fit;
    const confidence = b.result.scores.confidence - a.result.scores.confidence;
    if (Math.abs(confidence) > 0.001) return confidence;
    return a.candidateId.localeCompare(b.candidateId);
  });
}
