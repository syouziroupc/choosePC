import { resolveHardware } from "./catalog";
import { evaluatePc } from "./evaluation";
import type { Decision, EvaluationResult, MarketEstimate, NormalizedPC, UseCaseProfile } from "./types";

export interface CandidateEvaluation { candidateId: string; result: EvaluationResult }
export interface RecommendationCandidate { candidateId: string; pc: NormalizedPC; market?: MarketEstimate | null }
export interface RecommendationResult extends CandidateEvaluation { pc: NormalizedPC; market?: MarketEstimate | null }

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
    const value = b.result.scores.value - a.result.scores.value;
    if (Math.abs(value) > 0.001) return value;
    const confidence = b.result.scores.confidence - a.result.scores.confidence;
    if (Math.abs(confidence) > 0.001) return confidence;
    return a.candidateId.localeCompare(b.candidateId);
  });
}

export function evaluateAndRankCandidates(args: {
  candidates: readonly RecommendationCandidate[];
  profile: UseCaseProfile;
  engineVersion?: string;
  knowledgeVersion?: string;
}): RecommendationResult[] {
  const evaluated: RecommendationResult[] = args.candidates.map((candidate) => {
    const hardware = resolveHardware(candidate.pc.cpu?.raw, candidate.pc.gpu?.raw, candidate.pc.gpu?.tgpW, {
      cpuConfidence: candidate.pc.cpu?.confidence,
      gpuConfidence: candidate.pc.gpu?.confidence,
    });
    return {
      candidateId: candidate.candidateId,
      pc: candidate.pc,
      market: candidate.market,
      result: evaluatePc({
        pc: candidate.pc,
        profile: args.profile,
        hardware,
        market: candidate.market,
        context: "purchase",
        engineVersion: args.engineVersion,
        knowledgeVersion: args.knowledgeVersion,
      }),
    };
  });

  const ordering = new Map(rankCandidates(evaluated).map((item, index) => [item.candidateId, index]));
  return [...evaluated].sort((a, b) => (ordering.get(a.candidateId) ?? Number.MAX_SAFE_INTEGER) - (ordering.get(b.candidateId) ?? Number.MAX_SAFE_INTEGER));
}
