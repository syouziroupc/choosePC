import { describe, expect, it } from "vitest";
import { persistTrustedMarketObservation } from "../src/market-store";

const pc = {
  category: "general_laptop",
  cpu: { raw: "Intel Core i5-1235U", confidence: 95 },
  gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 95 },
  memory: { sizeGb: 16, upgradeable: false },
  storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
  condition: { type: "used", grade: "A", defects: [] },
  commerce: { priceJpy: 45000, warrantyDays: 90 },
  confidence: {},
};

describe("trusted market observation persistence", () => {
  it("does not require hardware catalog rows before knowledge tables are seeded", async () => {
    let insertSql = "";
    let bound: unknown[] = [];
    const db = {
      prepare(query: string) {
        insertSql = query;
        return {
          bind(...args: unknown[]) {
            bound = args;
            return {
              async run() { return { success: true }; },
            };
          },
        };
      },
    };

    const result = await persistTrustedMarketObservation({
      env: { DB: db as never },
      observation: {
        pc: pc as never,
        priceJpy: 42000,
        observedAt: new Date().toISOString(),
        source: "retailer_listing",
        merchant: "Example Shop",
      },
    });

    expect(result.id).toBeTruthy();
    expect(insertSql).toMatch(/INSERT INTO market_observations/i);
    expect(bound[6]).toBeNull();
    expect(bound[7]).toBeNull();
    const evidence = JSON.parse(String(bound[10])) as Record<string, unknown>;
    expect(evidence.hardwareKnowledgeSeeded).toBe(false);
    expect(evidence).toHaveProperty("resolvedCpuId");
    expect(evidence).toHaveProperty("resolvedGpuId");
  });
});
