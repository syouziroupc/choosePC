import { describe, expect, it } from "vitest";
import { OFFER_MAX_AGE_MS, upsertTrustedMerchantOffer } from "../src/offer-store";

const pc = {
  category: "general_laptop",
  cpu: { raw: "Intel Core i5-1235U", confidence: 95 },
  gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 95 },
  memory: { sizeGb: 16, upgradeable: false },
  storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
  condition: { type: "used", grade: "A", defects: [] },
  commerce: { priceJpy: 999999, warrantyDays: 90 },
  confidence: {},
};

describe("trusted merchant offer persistence", () => {
  it("stores neutral facts, clears affiliate_url, uses canonical row price and assigns a 30-day expiry", async () => {
    const statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            statements.push({ sql, args });
            return {
              async first() { return null; },
              async run() { return { success: true }; },
            };
          },
        };
      },
    };
    const observedAt = "2026-08-01T00:00:00.000Z";

    const stored = await upsertTrustedMerchantOffer({
      env: { DB: db as never },
      offer: {
        merchant: "Example Shop",
        title: "Example PC",
        priceJpy: 42000,
        productUrl: "https://example.com/item#fragment",
        stockState: "in_stock",
        pc: pc as never,
        observedAt,
      },
    });

    expect(stored.id).toMatch(/^offer-[a-f0-9]{40}$/);
    expect(stored.created).toBe(true);
    expect(stored.expiresAt).toBe(new Date(new Date(observedAt).getTime() + OFFER_MAX_AGE_MS).toISOString());
    const insert = statements.find((statement) => /INSERT INTO merchant_offers/i.test(statement.sql));
    expect(insert).toBeTruthy();
    expect(insert!.sql).toMatch(/affiliate_url/i);
    expect(insert!.sql).toMatch(/VALUES \(\?, \?, \?, \?, \?, NULL,/i);
    expect(insert!.sql).toMatch(/affiliate_url = NULL/i);
    expect(insert!.sql).not.toMatch(/commission/i);
    expect(insert!.args[3]).toBe(42000);
    expect(insert!.args[4]).toBe("https://example.com/item");
    const normalized = JSON.parse(String(insert!.args[7])) as { commerce: { priceJpy: number } };
    expect(normalized.commerce.priceJpy).toBe(42000);
    expect(insert!.args[9]).toBe(stored.expiresAt);
  });

  it("caps direct-store expiry requests at the shared 30-day maximum", async () => {
    const writes: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            if (/INSERT INTO merchant_offers/i.test(sql)) writes.push({ sql, args });
            return {
              async first() { return null; },
              async run() { return { success: true }; },
            };
          },
        };
      },
    };
    const observedAt = "2026-08-01T00:00:00.000Z";
    const stored = await upsertTrustedMerchantOffer({
      env: { DB: db as never },
      offer: {
        merchant: "Example Shop",
        title: "Example PC",
        priceJpy: 42000,
        productUrl: "https://example.com/item",
        stockState: "in_stock",
        pc: pc as never,
        observedAt,
        expiresAt: "2026-11-01T00:00:00.000Z",
      },
    });
    expect(stored.expiresAt).toBe("2026-08-31T00:00:00.000Z");
    expect(writes[0].args[9]).toBe(stored.expiresAt);
  });

  it("uses a stable ID for the same merchant and normalized product URL", async () => {
    const ids: string[] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            if (/INSERT INTO merchant_offers/i.test(sql)) ids.push(String(args[0]));
            return {
              async first() { return null; },
              async run() { return { success: true }; },
            };
          },
        };
      },
    };
    const offer = {
      merchant: "Example Shop",
      title: "Example PC",
      priceJpy: 42000,
      productUrl: "https://example.com/item#one",
      stockState: "in_stock" as const,
      pc: pc as never,
      observedAt: new Date().toISOString(),
    };
    await upsertTrustedMerchantOffer({ env: { DB: db as never }, offer });
    await upsertTrustedMerchantOffer({ env: { DB: db as never }, offer: { ...offer, productUrl: "https://example.com/item#two" } });
    expect(ids[0]).toBe(ids[1]);
  });
});
