import { describe, expect, it } from "vitest";
import { estimateMarket } from "../src/market";

const now = new Date("2026-08-13T00:00:00Z");
function observation(priceJpy: number, ageDays = 5, similarity = 0.95, sourceConfidence = 0.9) { return { priceJpy, observedAt: new Date(now.getTime() - ageDays * 86_400_000).toISOString(), similarity, sourceConfidence }; }

describe("robust market estimator", () => {
  it("returns a broad low-confidence range from one valid observation", () => { const r=estimateMarket([observation(30000)],{now}); expect(r.estimate).not.toBeNull(); expect(r.estimate!.sampleCount).toBe(1); expect(r.estimate!.confidence).toBeLessThanOrEqual(28); expect(r.estimate!.lowPriceJpy).toBe(21000); expect(r.estimate!.highPriceJpy).toBe(39000); });
  it("returns a low-confidence range from two observations instead of dropping the amount", () => { const r=estimateMarket([observation(30000),observation(32000)],{now}); expect(r.estimate).not.toBeNull(); expect(r.estimate!.sampleCount).toBe(2); expect(r.estimate!.confidence).toBeLessThanOrEqual(42); expect(r.estimate!.lowPriceJpy).toBe(27000); expect(r.estimate!.highPriceJpy).toBe(35200); });
  it("can explicitly require three observations", () => { expect(estimateMarket([observation(30000),observation(31000)],{now,sparseMinimumSamples:3}).estimate).toBeNull(); });
  it("uses a robust center rather than being pulled by a single extreme price", () => { const r=estimateMarket([observation(30000),observation(31000),observation(32000),observation(32500),observation(33000),observation(180000)],{now}); expect(r.estimate).not.toBeNull(); expect(r.estimate!.fairPriceJpy).toBeGreaterThanOrEqual(30000); expect(r.estimate!.fairPriceJpy).toBeLessThanOrEqual(34000); expect(r.rejectedSamples).toBeGreaterThanOrEqual(1); });
  it("downweights stale and low-similarity observations", () => { const r=estimateMarket([observation(40000,2,.98,.95),observation(41000,4,.98,.95),observation(42000,6,.98,.95),observation(90000,240,.40,.50)],{now}); expect(r.estimate).not.toBeNull(); expect(r.estimate!.fairPriceJpy).toBeLessThan(50000); });
  it("reduces confidence when the distribution is wide", () => { const tight=estimateMarket([observation(40000),observation(40500),observation(41000),observation(41500),observation(42000)],{now}); const wide=estimateMarket([observation(25000),observation(34000),observation(41000),observation(51000),observation(62000)],{now}); expect(tight.estimate!.confidence).toBeGreaterThan(wide.estimate!.confidence); });
  it("filters observations that are too weakly matched", () => { const r=estimateMarket([observation(30000,5,.2,.95),observation(31000,5,.95,.95),observation(32000,5,.95,.95),observation(33000,5,.95,.95)],{now}); expect(r.acceptedSamples).toBe(3); });
});
