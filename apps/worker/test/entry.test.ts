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

function request(body: unknown, token = "offer-secret") {
  return new Request("https://choosepc.test/api/internal/offers/upsert", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function fakeDb() {
  const writes: Array<{ sql: string; args: unknown[] }> = [];
  return {
    writes,
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async first() { return null; },
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

const validOffer = {
  merchant: "Example Shop",
  title: "Example PC",
  priceJpy: 42000,
  productUrl: "https://example.com/item",
  stockState: "in_stock",
  pc,
  observedAt: new Date().toISOString(),
};

describe("Worker internal offer ingestion entry", () => {
  it("delegates ordinary public API requests to the base worker", async () => {
    const response = await entry.fetch(
      new Request("https://choosepc.test/api/v1/health"),
      { URL_INSPECT_LIMITER: limiter() } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, service: "choosePC" });
  });

  it("conceals the ingestion route without the configured token", async () => {
    const response = await entry.fetch(
      request({ offer: validOffer }, "wrong"),
      { URL_INSPECT_LIMITER: limiter(), OFFER_INGEST_TOKEN: "offer-secret" } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(404);
  });

  it("rejects commercial metadata at the neutral ingestion boundary", async () => {
    const { DB } = fakeDb();
    const response = await entry.fetch(
      request({ offer: { ...validOffer, affiliateUrl: "https://affiliate.example/item" } }),
      { URL_INSPECT_LIMITER: limiter(), OFFER_INGEST_TOKEN: "offer-secret", DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_OFFERS" });
  });

  it("upserts a validated neutral offer with an authenticated token", async () => {
    const { DB, writes } = fakeDb();
    const response = await entry.fetch(
      request({ offer: validOffer }),
      { URL_INSPECT_LIMITER: limiter(), OFFER_INGEST_TOKEN: "offer-secret", DB } as never,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const data = await response.json() as { createdCount: number; updatedCount: number; stored: Array<{ id: string }> };
    expect(data.createdCount).toBe(1);
    expect(data.updatedCount).toBe(0);
    expect(data.stored[0].id).toMatch(/^offer-[a-f0-9]{40}$/);
    const insert = writes.find((item) => /INSERT INTO merchant_offers/i.test(item.sql));
    expect(insert).toBeTruthy();
    expect(insert!.sql).toMatch(/affiliate_url = NULL/i);
  });
});
