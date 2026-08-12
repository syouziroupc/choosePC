import type { Decision, EvaluationResult, HardConstraint, ScoreVector } from "./types";

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

export function aggregateScore(scores: ScoreVector): number {
  const base =
    scores.hardware * 0.22 +
    scores.fit * 0.30 +
    scores.value * 0.25 +
    scores.condition * 0.08 +
    scores.longevity * 0.15;
  return clamp(base - scores.risk * 0.35);
}

export function decide(
  scores: ScoreVector,
  constraints: HardConstraint[] = [],
): Decision {
  const criticalKnown = constraints.some((x) => x.severity === "critical" && x.known);
  const criticalUnknown = constraints.some((x) => x.severity === "critical" && !x.known);

  if (criticalKnown) return "avoid";
  if (criticalUnknown || scores.confidence < 55) return "insufficient_data";
  if (scores.risk >= 75) return "avoid";
  if (scores.value < 45 && scores.fit >= 70 && scores.hardware >= 65) return "overpriced";

  const overall = aggregateScore(scores);
  if (overall >= 85) return "strong_buy";
  if (overall >= 72) return "buy";
  if (overall >= 60) return "fair";
  if (overall >= 45) return scores.value < 55 ? "overpriced" : "fair";
  return "avoid";
}

export function buildEvaluationResult(args: {
  scores: ScoreVector;
  constraints?: HardConstraint[];
  reasons?: string[];
  warnings?: string[];
  engineVersion: string;
  knowledgeVersion: string;
}): EvaluationResult {
  const overall = aggregateScore(args.scores);
  return {
    scores: { ...args.scores, overall },
    decision: decide(args.scores, args.constraints ?? []),
    reasons: args.reasons ?? [],
    warnings: args.warnings ?? [],
    engineVersion: args.engineVersion,
    knowledgeVersion: args.knowledgeVersion,
  };
}
