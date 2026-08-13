import { describe, expect, it } from "vitest";
import { upsertConversion } from "../src/conversion-store";

function fakeDb(click: { id: string; program_id: string | null; offer_id: string | null } | null) {
  const statements: Array<{ sql: string; args: unknown[]; kind: "read" | "write" }> = [];
  return {
    statements,
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async first() {
                statements.push({ sql, args, kind: "read" });
                if (/FROM outbound_clicks/i.test(sql)) return click;
                return null;
              },
              async run() {
                statements.push({ sql, args, kind: "write" });
                return { success: true };
              },
            };
          },
        };
      },
    },
  };
}

const conversion = {
  provider: "ExampleASP",
  externalReference: "order-123",
  outboundClickId: "click-123",
  occurredAt: "2026-08-13T04:00:00.000Z",
  orderValueJpy: 50000,
  commissionJpy: 1500,
  status: "approved" as const,
  metadata: { rawStatus: "confirmed" },
};

describe("conversion persistence", () => {
  it("attributes only to an existing click and copies its program/offer identity", async () => {
    const db = fakeDb({ id: "click-123", program_id: "program-a", offer_id: "offer-a" });
    const stored = await upsertConversion({ env: { DB: db.DB as never }, conversion });
    expect(stored).toMatchObject({
      attributed: true,
      outboundClickId: "click-123",
      programId: "program-a",
      offerId: "offer-a",
    });
    expect(stored.id).toMatch(/^conversion-[a-f0-9]{40}$/);
    const insert = db.statements.find((item) => /INSERT INTO conversion_events/i.test(item.sql));
    expect(insert).toBeTruthy();
    expect(insert!.args[3]).toBe("click-123");
    expect(insert!.args[8]).toBe("program-a");
    expect(insert!.args[9]).toBe("offer-a");
  });

  it("rejects an unknown click instead of guessing attribution", async () => {
    const db = fakeDb(null);
    await expect(upsertConversion({ env: { DB: db.DB as never }, conversion }))
      .rejects.toThrow("CONVERSION_CLICK_NOT_FOUND");
    expect(db.statements.some((item) => item.kind === "write")).toBe(false);
  });

  it("accepts an explicitly unattributed conversion without inventing a click", async () => {
    const db = fakeDb(null);
    const stored = await upsertConversion({
      env: { DB: db.DB as never },
      conversion: { ...conversion, outboundClickId: null, externalReference: "order-unattributed" },
    });
    expect(stored.attributed).toBe(false);
    const insert = db.statements.find((item) => /INSERT INTO conversion_events/i.test(item.sql));
    expect(insert!.args[3]).toBeNull();
    expect(insert!.args[8]).toBeNull();
    expect(insert!.args[9]).toBeNull();
  });

  it("derives a stable ID from provider and external reference for safe re-import", async () => {
    const db = fakeDb({ id: "click-123", program_id: "program-a", offer_id: "offer-a" });
    const first = await upsertConversion({ env: { DB: db.DB as never }, conversion });
    const second = await upsertConversion({
      env: { DB: db.DB as never },
      conversion: { ...conversion, status: "refunded", commissionJpy: 0 },
    });
    expect(first.id).toBe(second.id);
    const writes = db.statements.filter((item) => /INSERT INTO conversion_events/i.test(item.sql));
    expect(writes).toHaveLength(2);
    expect(writes[1].sql).toMatch(/ON CONFLICT\(id\) DO UPDATE/i);
  });
});
