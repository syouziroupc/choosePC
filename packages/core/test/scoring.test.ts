import { describe, expect, it } from "vitest";
import { marketConfidence, scoreMarketValue, scoreRequirement } from "../src/scoring";

describe("requirement scoring directions", () => {
  it("rewards higher values for normal requirements", () => {
    const band = { metric: "ramGb" as const, minimum: 8, preferred: 16, weight: 1 };
    expect(scoreRequirement(16, band)).toBeGreaterThan(scoreRequirement(8, band));
    expect(scoreRequirement(4, band)).toBeLessThan(60);
  });

  it("rewards lower values for mobility requirements", () => {
    const band = { metric: "weightKg" as const, minimum: 1.8, preferred: 1.2, weight: 1, direction: "lower_is_better" as const };
    expect(scoreRequirement(1.0, band)).toBeGreaterThan(scoreRequirement(1.5, band));
    expect(scoreRequirement(2.4, band)).toBeLessThan(55);
  });
});

describe("market scoring", () => {
  it("scores a clearly cheaper offer above a clearly expensive offer", () => {
    const market = { fairPriceJpy: 100000, source: "observed_market" as const, sampleCount: 20, confidence: 85, ageDays: 3 };
    expect(scoreMarketValue(80000, market)).toBeGreaterThan(scoreMarketValue(130000, market));
  });

  it("caps user-entered comparison price confidence", () => {
    const userEstimate = { fairPriceJpy: 100000, source: "user_estimate" as const, sampleCount: 1, confidence: 100, ageDays: 0 };
    expect(marketConfidence(userEstimate)).toBeLessThanOrEqual(45);
  });
});
