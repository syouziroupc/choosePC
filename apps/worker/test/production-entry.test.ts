import { describe, expect, it } from "vitest";
import production from "../src/production-entry";

function limiter() {
  return { async limit() { return { success: true }; } };
}

function outboundDb({ failWrite = false } = {}) {
  const writes: Array<{ sql: string; args: unknown[] }> = [];
  return {
    writes,
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async all() {
                if (/FROM merchant_offers mo/i.test(sql)) {
                  return {
                    results: [{
                      offer_id: "offer-1",
                      merchant: "Example Shop",
                      title: "Example PC",
                      price_jpy: 42000,
                      product_url: "https://shop.example/item",
                      program_id: "program-a",
                      attribution_id: "attr-a",
                      program_type: "affiliate",
                      program_status: "active",
                      destination_url: "https://affiliate.example/item?campaign=pc",
                      disclosure_text: "広告リンクを含みます。",
                      click_ref_param: "subid",
                    }],
                  };
                }
                return { results: [] };
              },
              async run() {
                if (failWrite && /INSERT INTO outbound_clicks/i.test(sql)) throw new Error("db unavailable");
                writes.push({ sql, args });
                return { success: true };
              },
            };
          },
        };
      },
    },
  };
}

describe("production entry", () => {
  it("persists a click before appending its ID to the affiliate destination", async () => {
    const db = outboundDb();
    const response = await production.fetch(
      new Request("https://choosepc.test/api/v1/outbound/offer-1", { headers: { cookie: "pc_assist_sid=0123456789abcdef0123456789abcdef" } }),
      { URL_INSPECT_LIMITER: limiter(), DB: db.DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    const clickId = location.searchParams.get("subid");
    expect(clickId).toMatch(/^[0-9a-f-]{36}$/i);
    const write = db.writes.find((item) => /INSERT INTO outbound_clicks/i.test(item.sql));
    expect(write).toBeTruthy();
    expect(write!.args[0]).toBe(clickId);
    expect(write!.args[6]).toBe("program-a");
  });

  it("does not emit an orphan click reference when persistence fails", async () => {
    const db = outboundDb({ failWrite: true });
    const response = await production.fetch(
      new Request("https://choosepc.test/api/v1/outbound/offer-1"),
      { URL_INSPECT_LIMITER: limiter(), DB: db.DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://affiliate.example/item?campaign=pc");
  });

  it("conceals conversion import without the dedicated token", async () => {
    const response = await production.fetch(
      new Request("https://choosepc.test/api/internal/conversions/upsert", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer wrong" },
        body: JSON.stringify({ conversion: { provider: "asp", externalReference: "order-1", occurredAt: new Date().toISOString(), status: "approved" } }),
      }),
      { URL_INSPECT_LIMITER: limiter(), CONVERSION_IMPORT_TOKEN: "secret" } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(404);
  });

  it("conceals revenue metrics without commercial-admin authority", async () => {
    const response = await production.fetch(
      new Request("https://choosepc.test/api/internal/metrics/revenue?days=30", { headers: { authorization: "Bearer wrong" } }),
      { URL_INSPECT_LIMITER: limiter(), COMMERCIAL_ADMIN_TOKEN: "secret" } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(404);
  });

  it("rejects invalid metric windows before querying revenue", async () => {
    const response = await production.fetch(
      new Request("https://choosepc.test/api/internal/metrics/revenue?days=0", { headers: { authorization: "Bearer secret" } }),
      { URL_INSPECT_LIMITER: limiter(), COMMERCIAL_ADMIN_TOKEN: "secret", DB: {} } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_WINDOW" });
  });
});
