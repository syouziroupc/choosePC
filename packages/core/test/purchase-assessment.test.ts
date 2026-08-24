import { describe, expect, it } from "vitest";
import { aggregateScore, decide, evaluatePc } from "../src/evaluation";
import { resolveHardware } from "../src/catalog";
import { USE_CASES } from "../src/presets";
import type { EvaluationInput, NormalizedPC } from "../src/types";

function basePc(overrides: Partial<NormalizedPC> = {}): NormalizedPC {
  return {
    category: "general_laptop",
    cpu: { raw: "Intel Core i5-1235U", confidence: 95 },
    gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 95 },
    memory: { sizeGb: 16, upgradeable: false },
    storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
    display: { refreshHz: 60 },
    mobility: { weightKg: 1.2 },
    condition: { type: "used", grade: "A", batteryHealthPct: 85, defects: [] },
    commerce: { priceJpy: 45000, warrantyDays: 90 },
    confidence: {},
    extra: { upgradeabilityScore: 50, platformAgeYears: 3, osSupportYears: 4 },
    ...overrides,
  };
}

function run(pc: NormalizedPC, useCase = "office", fairPrice = 50000) {
  const input: EvaluationInput = {
    pc,
    profile: USE_CASES[useCase],
    hardware: resolveHardware(pc.cpu?.raw, pc.gpu?.raw, pc.gpu?.tgpW),
    market: { fairPriceJpy: fairPrice, source: "observed_market", sampleCount: 20, confidence: 90, ageDays: 3 },
  };
  return evaluatePc(input);
}

describe("price + performance-fit public assessment", () => {
  it("uses only fit and price in the compatibility aggregate", () => {
    const scores = { hardware: 0, fit: 80, value: 60, condition: 0, longevity: 0, risk: 100, confidence: 90 };
    expect(aggregateScore(scores)).toBe(70);
    expect(decide(scores)).toBe("buy");
  });

  it("does not let condition or longevity change the purchase verdict", () => {
    const first = { hardware: 10, fit: 82, value: 70, condition: 5, longevity: 5, risk: 10, confidence: 90 };
    const second = { ...first, hardware: 100, condition: 100, longevity: 100, risk: 65 };
    expect(decide(first)).toBe(decide(second));
    expect(aggregateScore(first)).toBe(aggregateScore(second));
  });

  it("returns explicit price and performance-fit axes", () => {
    const result = run(basePc());
    expect(result.purchaseAssessment.price.marketAvailable).toBe(true);
    expect(result.purchaseAssessment.price.score).toBe(result.scores.value);
    expect(result.purchaseAssessment.performanceFit.score).toBe(result.scores.fit);
    expect(["good", "fair", "high"]).toContain(result.purchaseAssessment.price.verdict);
    expect(["sufficient", "borderline", "insufficient", "unknown"]).toContain(result.purchaseAssessment.performanceFit.verdict);
  });

  it("shows the concrete weak component when RAM is below the use-case minimum", () => {
    const result = run(basePc({ memory: { sizeGb: 4, upgradeable: false } }), "office");
    const weakness = result.purchaseAssessment.weaknesses.find((item) => item.metric === "ramGb");
    expect(weakness?.label).toBe("メモリ容量");
    expect(weakness?.severity).toBe("critical");
    expect(weakness?.actual).toBe(4);
    expect(result.decision).toBe("avoid");
  });

  it("shows limited headroom even when a component clears the minimum", () => {
    const result = run(basePc({ memory: { sizeGb: 8, upgradeable: false } }), "office");
    const weakness = result.purchaseAssessment.weaknesses.find((item) => item.metric === "ramGb");
    expect(weakness?.severity).toBe("notice");
    expect(weakness?.message).toContain("推奨水準");
  });

  it("marks price unknown instead of inventing a value judgement without market evidence", () => {
    const pc = basePc();
    const result = evaluatePc({
      pc,
      profile: USE_CASES.office,
      hardware: resolveHardware(pc.cpu?.raw, pc.gpu?.raw, pc.gpu?.tgpW),
      market: null,
    });
    expect(result.purchaseAssessment.price.score).toBeNull();
    expect(result.purchaseAssessment.price.verdict).toBe("unknown");
    expect(result.decision).toBe("insufficient_data");
  });
});
