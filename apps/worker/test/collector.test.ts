import { describe, expect, it } from "vitest";
import { upsertCollectorSource, validCollectorSourceInput } from "../src/collector";

describe("collector source guardrails", () => {
  it("accepts a supported HTTPS merchant source", () => {
    expect(validCollectorSourceInput({
      productUrl: "https://www.dospara.co.jp/TC30/example.html",
      mode: "both",
      category: "gaming_desktop",
      conditionType: "new",
      warrantyDays: 365,
      refreshMinutes: 360,
    })).toBe(true);
  });

  it("rejects unsupported domains, credentials, non-HTTPS URLs and unsafe refresh rates", () => {
    expect(validCollectorSourceInput({
      productUrl: "https://example.test/item",
      mode: "both",
      category: "general_laptop",
      conditionType: "new",
    })).toBe(false);
    expect(validCollectorSourceInput({
      productUrl: "https://user:pass@amazon.co.jp/item",
      mode: "both",
      category: "general_laptop",
      conditionType: "new",
    })).toBe(false);
    expect(validCollectorSourceInput({
      productUrl: "http://amazon.co.jp/item",
      mode: "both",
      category: "general_laptop",
      conditionType: "new",
    })).toBe(false);
    expect(validCollectorSourceInput({
      productUrl: "https://amazon.co.jp/item",
      mode: "both",
      category: "general_laptop",
      conditionType: "new",
      refreshMinutes: 5,
    })).toBe(false);
  });

  it("derives the merchant server-side and normalizes away URL fragments", async () => {
    const writes: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                writes.push({ sql, args });
                return { success: true };
              },
              async first() {
                if (/FROM collector_sources/i.test(sql)) {
                  return {
                    id: "collector-test",
                    merchant: "Amazon.co.jp",
                    product_url: "https://www.amazon.co.jp/dp/example",
                    mode: "both",
                    category: "general_laptop",
                    condition_type: "new",
                    warranty_days: 365,
                    enabled: 1,
                    refresh_minutes: 360,
                    next_run_at: "2026-08-13 00:00:00",
                    last_run_at: null,
                    last_success_at: null,
                    last_status: "pending",
                    failure_count: 0,
                    last_error: null,
                    parser_name: null,
                    parser_version: null,
                  };
                }
                return null;
              },
            };
          },
        };
      },
    };

    const source = await upsertCollectorSource({ DB: db as never }, {
      productUrl: "https://www.amazon.co.jp/dp/example#reviews",
      mode: "both",
      category: "general_laptop",
      conditionType: "new",
      warrantyDays: 365,
    });

    const upsert = writes.find((write) => /INSERT INTO collector_sources/i.test(write.sql));
    expect(upsert).toBeTruthy();
    expect(upsert!.args[1]).toBe("Amazon.co.jp");
    expect(upsert!.args[2]).toBe("https://www.amazon.co.jp/dp/example");
    expect(source.merchant).toBe("Amazon.co.jp");
  });
});
