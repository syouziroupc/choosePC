import { describe, expect, it } from "vitest";
import { aggregateScore, decide } from "../src/evaluation";

const good = {
  hardware: 85,
  fit: 92,
  value: 90,
  condition: 80,
  longevity: 82,
  risk: 10,
  confidence: 90,
};

describe("evaluation", () => {
  it("produces a strong result for a balanced high-value machine", () => {
    expect(aggregateScore(good)).toBeGreaterThan(80);
    expect(["strong_buy", "buy"]).toContain(decide(good));
  });

  it("never hides a known critical constraint behind a high score", () => {
    expect(decide(good, [{ code: "PSU_CRITICAL", severity: "critical", known: true }])).toBe("avoid");
  });

  it("does not pretend confidence is sufficient", () => {
    expect(decide({ ...good, confidence: 40 })).toBe("insufficient_data");
  });

  it("recognizes an otherwise good but overpriced machine", () => {
    expect(decide({ ...good, value: 35 })).toBe("overpriced");
  });
});
