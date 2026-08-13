import { describe, expect, it } from "vitest";
import { assessSale } from "../src/sale";
import type { NormalizedPC } from "../src/types";

const pc: NormalizedPC = { category: "general_laptop", condition: { type: "used", grade: "B", defects: [] }, commerce: {}, confidence: {} };

describe("sale assistant", () => {
  it("does not invent a selling estimate without market evidence", () => {
    expect(assessSale(pc, null).decision).toBe("insufficient_data");
  });

  it("does not upgrade a user-entered comparison price into market evidence", () => {
    expect(assessSale(pc, { fairPriceJpy: 30000, source: "user_estimate", sampleCount: 1, confidence: 90, ageDays: 0 }).decision).toBe("insufficient_data");
  });

  it("returns observed market evidence without fabricating a dealer quote", () => {
    const result = assessSale(pc, { fairPriceJpy: 30000, source: "observed_market", lowPriceJpy: 26000, highPriceJpy: 34000, sampleCount: 18, confidence: 82, ageDays: 4 });
    expect(result.decision).toBe("sellable");
    expect(result.market?.fairPriceJpy).toBe(30000);
    expect(result.market?.lowPriceJpy).toBe(26000);
  });
});
