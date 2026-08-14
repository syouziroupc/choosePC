import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, KNOWLEDGE_VERSION, evaluateAndRankCandidates, evaluatePc } from "../src/index";
import type { NormalizedPC, UseCaseProfile } from "../src/types";

const pc: NormalizedPC = {
  category: "general_laptop",
  cpu: { raw: "Intel Core i5-1235U", confidence: 95 },
  gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 95 },
  memory: { sizeGb: 16 },
  storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
  condition: { type: "new", defects: [] },
  commerce: { priceJpy: 89800, warrantyDays: 365 },
  confidence: {},
};

const profile: UseCaseProfile = {
  id: "office",
  name: "Office",
  requirements: [],
};

describe("active engine and knowledge version provenance", () => {
  it("does not allow a caller to relabel a current evaluation with stale versions", () => {
    const result = evaluatePc({
      pc,
      profile,
      hardware: { cpu: null, gpu: null, cpuConfidence: 95, gpuConfidence: 95 },
      market: null,
      engineVersion: "0.2.0",
      knowledgeVersion: "stale-knowledge",
    });

    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.knowledgeVersion).toBe(KNOWLEDGE_VERSION);
  });

  it("keeps recommendation evaluations on the same active versions", () => {
    const ranked = evaluateAndRankCandidates({
      candidates: [{ candidateId: "candidate-1", pc, market: null }],
      profile,
      engineVersion: "0.2.0",
      knowledgeVersion: "stale-knowledge",
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].result.engineVersion).toBe(ENGINE_VERSION);
    expect(ranked[0].result.knowledgeVersion).toBe(KNOWLEDGE_VERSION);
  });
});
