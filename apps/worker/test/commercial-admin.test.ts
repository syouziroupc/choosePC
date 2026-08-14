import { describe, expect, it } from "vitest";
import { upsertCommercialConfiguration } from "../src/commercial-admin";

function fakeDb(offerMerchant = "Example Shop") {
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
                if (/SELECT merchant FROM merchant_offers/i.test(sql)) return { merchant: offerMerchant };
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

const program = {
  key: "affiliate-main",
  merchant: "Example Shop",
  programType: "affiliate" as const,
  status: "active" as const,
  commissionMetadata: { model: "percentage", rate: 0.03 },
  disclosureText: "広告リンクを含みます。",
  sourceUrl: "https://partner.example/program#fragment",
  lastVerifiedAt: new Date().toISOString(),
};

const link = { offerId: "offer-1", destinationUrl: "https://affiliate.example/item#fragment" };

describe("commercial configuration administration", () => {
  it("validates offer merchant before writing commercial configuration", async () => {
    const db = fakeDb("Different Shop");
    await expect(upsertCommercialConfiguration({ env: { DB: db.DB as never }, program, links: [link] }))
      .rejects.toThrow("COMMERCIAL_MERCHANT_MISMATCH");
    expect(db.statements.filter((item) => item.kind === "write")).toEqual([]);
  });

  it("stores commission only in post-ranking commercial_programs and normalizes HTTPS URLs", async () => {
    const db = fakeDb();
    const stored = await upsertCommercialConfiguration({ env: { DB: db.DB as never }, program, links: [link] });
    expect(stored.programId).toMatch(/^program-[a-f0-9]{40}$/);
    expect(stored.linkIds[0]).toMatch(/^attr-[a-f0-9]{40}$/);

    const programWrite = db.statements.find((item) => /INSERT INTO commercial_programs/i.test(item.sql));
    expect(programWrite).toBeTruthy();
    expect(String(programWrite!.args[4])).toContain("\"rate\":0.03");
    expect(programWrite!.args[6]).toBe("https://partner.example/program");

    const linkWrite = db.statements.find((item) => /INSERT INTO attribution_links/i.test(item.sql));
    expect(linkWrite).toBeTruthy();
    expect(linkWrite!.args[3]).toBe("https://affiliate.example/item");
    expect(linkWrite!.sql).not.toMatch(/commission/i);
  });

  it("keeps one stable attribution row per offer/program pair", async () => {
    const db = fakeDb();
    const first = await upsertCommercialConfiguration({ env: { DB: db.DB as never }, program, links: [link] });
    const second = await upsertCommercialConfiguration({
      env: { DB: db.DB as never },
      program,
      links: [{ ...link, destinationUrl: "https://affiliate.example/new-item" }],
    });
    expect(first.programId).toBe(second.programId);
    expect(first.linkIds[0]).toBe(second.linkIds[0]);
    expect(db.statements.some((item) => /DELETE FROM attribution_links/i.test(item.sql))).toBe(true);
  });
});
