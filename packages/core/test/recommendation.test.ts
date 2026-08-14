import { describe, expect, it } from "vitest";
import { rankCandidates } from "../src/recommendation";
import { attachCommercialMetadata } from "../src/monetization";
import type { EvaluationResult } from "../src/types";

function result(overall: number, decision: EvaluationResult["decision"]): EvaluationResult {
  return { scores: { overall, hardware: 80, fit: 80, value: 80, condition: 80, longevity: 80, risk: 10, confidence: 85 }, decision, reasons: [], reasonDetails: [], warnings: [], constraints: [], engineVersion: "x", knowledgeVersion: "x" };
}

describe("ranking / monetization separation", () => {
  it("freezes evaluative ranking before commercial metadata is attached", () => {
    const ranked = rankCandidates([
      { candidateId: "A", result: result(82, "buy") },
      { candidateId: "B", result: result(91, "strong_buy") },
    ]).map((x, i) => ({ offerId: x.candidateId, rank: i + 1, evaluationScore: x.result.scores.overall }));
    const commercial = new Map([
      ["A", { offerId: "A", merchantType: "affiliate" as const, destinationUrl: "https://example.com/a", disclosureRequired: true }],
      ["B", { offerId: "B", merchantType: "normal" as const, destinationUrl: "https://example.com/b", disclosureRequired: false }],
    ]);
    const resolved = attachCommercialMetadata(ranked, commercial);
    expect(resolved[0].offerId).toBe("B");
    expect(resolved[1].merchantType).toBe("affiliate");
  });

  it("cannot rank by commission because the ranking input contains no commercial metadata", () => {
    const ranked = rankCandidates([
      { candidateId: "no-commission", result: result(88, "buy") },
      { candidateId: "high-commission", result: result(82, "buy") },
    ]);
    expect(ranked[0].candidateId).toBe("no-commission");
  });
});
