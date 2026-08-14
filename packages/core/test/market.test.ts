import { describe, expect, it } from "vitest";
import { estimateMarket } from "../src/market";

const now = new Date("2026-08-13T00:00:00Z");
function observation(priceJpy: number, ageDays = 5, similarity = 0.95, sourceConfidence = 0.9) {
  return {
    priceJpy,
    observedAt: new Date(now.getTime() - ageDays * 86_400_000).toISOString(),
    similarity,
    sourceConfidence,
  };
}

describe("robust market estimator", () => {
  it("refuses to estimate from too few observations", () => {
    const result = estimateMarket([observation(30000), observation(31000)], { now });
    expect(result.estimate).toBeNull();
  });

  it("uses a robust center rather than being pulled by a single extreme price", () => {
    const result = estimateMarket([
      observation(30000),
      observation(31000),
      observation(32000),
      observation(32500),
      observation(33000),
      observation(180000),
    ], { now });
    expect(result.estimate).not.toBeNull();
    expect(result.estimate!.fairPriceJpy).toBeGreaterThanOrEqual(30000);
    expect(result.estimate!.fairPriceJpy).toBeLessThanOrEqual(34000);
    expect(result.rejectedSamples).toBeGreaterThanOrEqual(1);
  });

  it("downweights stale and low-similarity observations", () => {
    const result = estimateMarket([
      observation(40000, 2, 0.98, 0.95),
      observation(41000, 4, 0.98, 0.95),
      observation(42000, 6, 0.98, 0.95),
      observation(90000, 240, 0.40, 0.50),
    ], { now });
    expect(result.estimate).not.toBeNull();
    expect(result.estimate!.fairPriceJpy).toBeLessThan(50000);
  });

  it("reduces confidence when the observed price distribution is wide", () => {
    const tight = estimateMarket([observation(40000), observation(40500), observation(41000), observation(41500), observation(42000)], { now });
    const wide = estimateMarket([observation(25000), observation(34000), observation(41000), observation(51000), observation(62000)], { now });
    expect(tight.estimate).not.toBeNull();
    expect(wide.estimate).not.toBeNull();
    expect(tight.estimate!.confidence).toBeGreaterThan(wide.estimate!.confidence);
  });

  it("filters observations that are too weakly matched to the target", () => {
    const result = estimateMarket([
      observation(30000, 5, 0.2, 0.95),
      observation(31000, 5, 0.95, 0.95),
      observation(32000, 5, 0.95, 0.95),
      observation(33000, 5, 0.95, 0.95),
    ], { now });
    expect(result.estimate).not.toBeNull();
    expect(result.acceptedSamples).toBe(3);
  });
});
