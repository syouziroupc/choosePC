import { describe, expect, it } from "vitest";
import { loadOfferIngestionStatus } from "../src/offer-status";

function fakeDb() {
  const queries: string[] = [];
  return {
    queries,
    DB: {
      prepare(sql: string) {
        queries.push(sql);
        return {
          bind() {
            if (/GROUP BY merchant/i.test(sql)) {
              return {
                async all() {
                  return {
                    results: [
                      { merchant: "Fresh Shop", total: 8, eligible: 6, latest_observed_at: "2026-08-13T04:00:00.000Z" },
                      { merchant: "Old Shop", total: 4, eligible: 0, latest_observed_at: "2026-07-01T04:00:00.000Z" },
                    ],
                  };
                },
              };
            }
            return {
              async first() {
                return {
                  total: 12,
                  merchant_count: 2,
                  eligible: 6,
                  stale: 4,
                  expired: 3,
                  unavailable: 2,
                  expiring_24h: 1,
                  newest_observed_at: "2026-08-13T04:00:00.000Z",
                };
              },
            };
          },
        };
      },
    },
  };
}

describe("offer ingestion status", () => {
  it("reports bounded collector health using the same eligibility rules as recommendation", async () => {
    const db = fakeDb();
    const status = await loadOfferIngestionStatus({ DB: db.DB as never });
    expect(status).toMatchObject({
      maxAgeDays: 30,
      total: 12,
      merchantCount: 2,
      eligible: 6,
      stale: 4,
      expired: 3,
      unavailable: 2,
      expiringWithin24Hours: 1,
      newestObservedAt: "2026-08-13T04:00:00.000Z",
    });
    expect(status?.merchants).toEqual([
      { merchant: "Fresh Shop", total: 8, eligible: 6, latestObservedAt: "2026-08-13T04:00:00.000Z" },
      { merchant: "Old Shop", total: 4, eligible: 0, latestObservedAt: "2026-07-01T04:00:00.000Z" },
    ]);
    expect(db.queries).toHaveLength(2);
    expect(db.queries.join("\n")).toMatch(/datetime\(observed_at\)\s*>=\s*datetime\(\?\)/i);
    expect(db.queries.join("\n")).toMatch(/out_of_stock.*sold.*unavailable/is);
    expect(db.queries[1]).toMatch(/LIMIT 100/i);
  });

  it("returns null without a D1 binding", async () => {
    await expect(loadOfferIngestionStatus({})).resolves.toBeNull();
  });
});
