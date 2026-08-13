import { describe, expect, it } from "vitest";
import { loadRevenueMetrics } from "../src/revenue-metrics";

function fakeDb() {
  return {
    prepare(sql: string) {
      return {
        bind() {
          if (/recommendation_runs/i.test(sql) && /outbound_clicks/i.test(sql)) {
            return { async first() { return { evaluations: 120, recommendation_runs: 48, outbound_clicks: 20 }; } };
          }
          if (/FROM conversion_events/i.test(sql) && !/LEFT JOIN conversion_events/i.test(sql)) {
            return {
              async first() {
                return {
                  conversions: 5,
                  attributed_conversions: 4,
                  approved_conversions: 3,
                  pending_conversions: 1,
                  rejected_or_reversed: 1,
                  approved_order_value_jpy: 150000,
                  approved_commission_jpy: 4500,
                  pending_commission_jpy: 1200,
                };
              },
            };
          }
          if (/GROUP BY merchant_type/i.test(sql)) {
            return { async all() { return { results: [{ merchant_type: "affiliate", clicks: 12 }, { merchant_type: "own", clicks: 8 }] }; } };
          }
          if (/GROUP BY oc\.program_id/i.test(sql)) {
            return {
              async all() {
                return {
                  results: [{
                    program_id: "program-a",
                    merchant: "Example Shop",
                    program_type: "affiliate",
                    clicks: 12,
                    approved_conversions: 3,
                    approved_order_value_jpy: 150000,
                    approved_commission_jpy: 4500,
                    pending_commission_jpy: 1200,
                  }],
                };
              },
            };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      };
    },
  };
}

describe("revenue metrics", () => {
  it("reports observed approved and pending revenue separately", async () => {
    const metrics = await loadRevenueMetrics({ DB: fakeDb() as never }, 30);
    expect(metrics).toMatchObject({
      windowDays: 30,
      evaluations: 120,
      recommendationRuns: 48,
      outboundClicks: 20,
      conversions: 5,
      attributedConversions: 4,
      approvedConversions: 3,
      pendingConversions: 1,
      rejectedOrReversedConversions: 1,
      approvedOrderValueJpy: 150000,
      approvedCommissionJpy: 4500,
      pendingCommissionJpy: 1200,
      clickToApprovedConversionPct: 15,
      normalized30DayApprovedCommissionJpy: 4500,
    });
    expect(metrics?.clicksByMerchantType).toEqual({ affiliate: 12, own: 8 });
    expect(metrics?.topPrograms[0]).toMatchObject({ programId: "program-a", approvedCommissionJpy: 4500 });
  });

  it("clamps the reporting window and does not invent conversion rate without clicks", async () => {
    const db = fakeDb();
    const originalPrepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      const prepared = originalPrepare(sql);
      const originalBind = prepared.bind.bind(prepared);
      prepared.bind = ((...args: unknown[]) => {
        const result = originalBind(...args) as { first?: () => Promise<Record<string, number>>; all?: () => Promise<{ results: unknown[] }> };
        if (/recommendation_runs/i.test(sql) && /outbound_clicks/i.test(sql)) {
          return { async first() { return { evaluations: 0, recommendation_runs: 0, outbound_clicks: 0 }; } };
        }
        if (/FROM conversion_events/i.test(sql) && !/LEFT JOIN conversion_events/i.test(sql)) {
          return { async first() { return { conversions: 0, attributed_conversions: 0, approved_conversions: 0, pending_conversions: 0, rejected_or_reversed: 0, approved_order_value_jpy: 0, approved_commission_jpy: 0, pending_commission_jpy: 0 }; } };
        }
        return result;
      }) as typeof prepared.bind;
      return prepared;
    }) as typeof db.prepare;

    const metrics = await loadRevenueMetrics({ DB: db as never }, 9999);
    expect(metrics?.windowDays).toBe(365);
    expect(metrics?.clickToApprovedConversionPct).toBeNull();
    expect(metrics?.normalized30DayApprovedCommissionJpy).toBe(0);
  });
});
