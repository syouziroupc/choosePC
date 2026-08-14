import { describe, expect, it } from "vitest";
import entry from "../src/entry";

const pc = {
  category: "general_laptop",
  cpu: { raw: "Intel Core i5-1235U", confidence: 95 },
  gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 95 },
  memory: { sizeGb: 16, upgradeable: false },
  storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
  condition: { type: "used", grade: "A", defects: [] },
  commerce: { priceJpy: 42000, warrantyDays: 90 },
  confidence: {},
};

function limiter() {
  return { async limit() { return { success: true }; } };
}

function internalRequest(path: string, body: unknown, token: string) {
  return new Request(`https://choosepc.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function internalGet(path: string, token: string) {
  return new Request(`https://choosepc.test${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

function fakeDb(offerMerchant: string | null = null) {
  const writes: Array<{ sql: string; args: unknown[] }> = [];
  return {
    writes,
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async first() {
                if (/SELECT merchant FROM merchant_offers/i.test(sql) && offerMerchant) return { merchant: offerMerchant };
                return null;
              },
              async run() {
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

function offerStatusDb() {
  return {
    prepare(sql: string) {
      return {
        bind() {
          if (/GROUP BY merchant/i.test(sql)) {
            return {
              async all() {
                return { results: [{ merchant: "Example Shop", total: 2, eligible: 1, latest_observed_at: "2026-08-13T04:00:00.000Z" }] };
              },
            };
          }
          return {
            async first() {
              return {
                total: 2,
                merchant_count: 1,
                eligible: 1,
                stale: 1,
                expired: 1,
                unavailable: 0,
                expiring_24h: 0,
                newest_observed_at: "2026-08-13T04:00:00.000Z",
              };
            },
          };
        },
      };
    },
  };
}

const validOffer = {
  merchant: "Example Shop",
  title: "Example PC",
  priceJpy: 42000,
  productUrl: "https://example.com/item",
  stockState: "in_stock",
  pc,
  observedAt: new Date().toISOString(),
};

const validProgram = {
  key: "affiliate-main",
  merchant: "Example Shop",
  programType: "affiliate",
  status: "active",
  commissionMetadata: { model: "percentage", rate: 0.03 },
  disclosureText: "広告リンクを含みます。",
  sourceUrl: "https://partner.example/program",
  lastVerifiedAt: new Date().toISOString(),
};

describe("Worker internal administration entry", () => {
  it("delegates ordinary public API requests to the base worker", async () => {
    const response = await entry.fetch(
      new Request("https://choosepc.test/api/v1/health"),
      { URL_INSPECT_LIMITER: limiter() } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, service: "choosePC" });
  });

  it("conceals the neutral offer ingestion route without the configured token", async () => {
    const response = await entry.fetch(
      internalRequest("/api/internal/offers/upsert", { offer: validOffer }, "wrong"),
      { URL_INSPECT_LIMITER: limiter(), OFFER_INGEST_TOKEN: "offer-secret" } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(404);
  });

  it("rejects commercial metadata at the neutral offer ingestion boundary", async () => {
    const { DB } = fakeDb();
    const response = await entry.fetch(
      internalRequest("/api/internal/offers/upsert", { offer: { ...validOffer, affiliateUrl: "https://affiliate.example/item" } }, "offer-secret"),
      { URL_INSPECT_LIMITER: limiter(), OFFER_INGEST_TOKEN: "offer-secret", DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_OFFERS" });
  });

  it("rejects offer expiry beyond the shared 30-day freshness window", async () => {
    const { DB } = fakeDb();
    const observedAt = new Date();
    const response = await entry.fetch(
      internalRequest("/api/internal/offers/upsert", {
        offer: {
          ...validOffer,
          observedAt: observedAt.toISOString(),
          expiresAt: new Date(observedAt.getTime() + 31 * 86_400_000).toISOString(),
        },
      }, "offer-secret"),
      { URL_INSPECT_LIMITER: limiter(), OFFER_INGEST_TOKEN: "offer-secret", DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_OFFERS" });
  });

  it("upserts a validated neutral offer with an authenticated token", async () => {
    const { DB, writes } = fakeDb();
    const response = await entry.fetch(
      internalRequest("/api/internal/offers/upsert", { offer: validOffer }, "offer-secret"),
      { URL_INSPECT_LIMITER: limiter(), OFFER_INGEST_TOKEN: "offer-secret", DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const data = await response.json() as { createdCount: number; updatedCount: number; stored: Array<{ id: string; expiresAt: string }> };
    expect(data.createdCount).toBe(1);
    expect(data.updatedCount).toBe(0);
    expect(data.stored[0].id).toMatch(/^offer-[a-f0-9]{40}$/);
    expect(new Date(data.stored[0].expiresAt).getTime()).toBe(new Date(validOffer.observedAt).getTime() + 30 * 86_400_000);
    const insert = writes.find((item) => /INSERT INTO merchant_offers/i.test(item.sql));
    expect(insert).toBeTruthy();
    expect(insert!.sql).toMatch(/affiliate_url = NULL/i);
  });

  it("protects collector status with the offer-ingestion authority and returns bounded health data", async () => {
    const concealed = await entry.fetch(
      internalGet("/api/internal/offers/status", "wrong"),
      { URL_INSPECT_LIMITER: limiter(), OFFER_INGEST_TOKEN: "offer-secret", DB: offerStatusDb() as never } as never,
      {} as ExecutionContext,
    );
    expect(concealed.status).toBe(404);

    const response = await entry.fetch(
      internalGet("/api/internal/offers/status", "offer-secret"),
      { URL_INSPECT_LIMITER: limiter(), OFFER_INGEST_TOKEN: "offer-secret", DB: offerStatusDb() as never } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const data = await response.json() as { status: { maxAgeDays: number; eligible: number; stale: number; merchants: unknown[] } };
    expect(data.status.maxAgeDays).toBe(30);
    expect(data.status.eligible).toBe(1);
    expect(data.status.stale).toBe(1);
    expect(data.status.merchants).toHaveLength(1);
  });

  it("conceals commercial administration behind a separate token", async () => {
    const response = await entry.fetch(
      internalRequest("/api/internal/commercial/upsert", { program: validProgram, links: [] }, "offer-secret"),
      { URL_INSPECT_LIMITER: limiter(), COMMERCIAL_ADMIN_TOKEN: "commercial-secret" } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(404);
  });

  it("requires disclosure for an active monetized program", async () => {
    const { DB } = fakeDb("Example Shop");
    const response = await entry.fetch(
      internalRequest("/api/internal/commercial/upsert", {
        program: { ...validProgram, disclosureText: "" },
        links: [],
      }, "commercial-secret"),
      { URL_INSPECT_LIMITER: limiter(), COMMERCIAL_ADMIN_TOKEN: "commercial-secret", DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_COMMERCIAL_CONFIGURATION" });
  });

  it("rejects unsafe commercial click-reference parameter names", async () => {
    const { DB } = fakeDb("Example Shop");
    const response = await entry.fetch(
      internalRequest("/api/internal/commercial/upsert", {
        program: { ...validProgram, clickRefParam: "bad parameter" },
        links: [],
      }, "commercial-secret"),
      { URL_INSPECT_LIMITER: limiter(), COMMERCIAL_ADMIN_TOKEN: "commercial-secret", DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_COMMERCIAL_CONFIGURATION" });
  });

  it("refuses to attach a program to an offer from another merchant", async () => {
    const { DB } = fakeDb("Different Shop");
    const response = await entry.fetch(
      internalRequest("/api/internal/commercial/upsert", {
        program: validProgram,
        links: [{ offerId: "offer-1", destinationUrl: "https://affiliate.example/item" }],
      }, "commercial-secret"),
      { URL_INSPECT_LIMITER: limiter(), COMMERCIAL_ADMIN_TOKEN: "commercial-secret", DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "COMMERCIAL_MERCHANT_MISMATCH" });
  });

  it("stores post-ranking commercial configuration with an authenticated admin token", async () => {
    const { DB, writes } = fakeDb("Example Shop");
    const response = await entry.fetch(
      internalRequest("/api/internal/commercial/upsert", {
        program: validProgram,
        links: [{ offerId: "offer-1", destinationUrl: "https://affiliate.example/item" }],
      }, "commercial-secret"),
      { URL_INSPECT_LIMITER: limiter(), COMMERCIAL_ADMIN_TOKEN: "commercial-secret", DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const data = await response.json() as { stored: { programId: string; linkIds: string[] } };
    expect(data.stored.programId).toMatch(/^program-[a-f0-9]{40}$/);
    expect(data.stored.linkIds[0]).toMatch(/^attr-[a-f0-9]{40}$/);
    expect(writes.some((item) => /INSERT INTO commercial_programs/i.test(item.sql))).toBe(true);
    expect(writes.some((item) => /INSERT INTO attribution_links/i.test(item.sql))).toBe(true);
  });
});
