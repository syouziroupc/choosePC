import { describe, expect, it } from "vitest";
import { loadNeutralOfferCandidates } from "../src/offer-search";

const storedPc = {
  category: "general_laptop",
  cpu: { raw: "Intel Core i5-1235U", confidence: 95 },
  gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 95 },
  memory: { sizeGb: 16, upgradeable: false },
  storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
  condition: { type: "used", grade: "A", defects: [] },
  commerce: { priceJpy: 999999, warrantyDays: 90 },
  confidence: {},
};

describe("neutral merchant offer search", () => {
  it("does not query commercial fields before ranking and trusts canonical row price", async () => {
    let sql = "";
    const db = {
      prepare(query: string) {
        sql = query;
        return {
          bind() {
            return {
              async all() {
                return {
                  results: [{
                    id: "offer-1",
                    merchant: "Example Shop",
                    title: "Example PC",
                    price_jpy: 42000,
                    normalized_pc_json: JSON.stringify(storedPc),
                    observed_at: new Date().toISOString(),
                  }],
                };
              },
            };
          },
        };
      },
    };

    const result = await loadNeutralOfferCandidates({ DB: db as never }, { category: "general_laptop" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].candidateId).toBe("offer-1");
    expect(result.candidates[0].pc.commerce.priceJpy).toBe(42000);
    expect(result.candidates[0].market).toBeNull();
    expect(sql).not.toMatch(/affiliate_url/i);
    expect(sql).not.toMatch(/commercial_program/i);
    expect(sql).not.toMatch(/commission/i);
  });

  it("skips corrupt normalized PC rows instead of crashing recommendation", async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return {
                  results: [{
                    id: "broken",
                    merchant: "Example Shop",
                    title: "Broken",
                    price_jpy: 42000,
                    normalized_pc_json: "{not-json",
                    observed_at: new Date().toISOString(),
                  }],
                };
              },
            };
          },
        };
      },
    };

    const result = await loadNeutralOfferCandidates({ DB: db as never });
    expect(result.candidates).toEqual([]);
    expect(result.skippedRows).toBe(1);
  });
});
