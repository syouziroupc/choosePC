import { describe, expect, it } from "vitest";
import { upsertCommercialConfiguration } from "../src/commercial-admin";

type RecordedStatement = { sql: string; args: unknown[]; kind: "read" | "write" };

type FakePrepared = {
  sql: string;
  args: unknown[];
  bind: (...args: unknown[]) => FakePrepared;
  first: () => Promise<{ merchant: string } | null>;
  run: () => Promise<{ success: true }>;
};

function fakeDb(offerMerchant = "Example Shop") {
  const statements: RecordedStatement[] = [];
  const makePrepared = (sql: string, args: unknown[] = []): FakePrepared => ({
    sql,
    args,
    bind(...nextArgs: unknown[]) {
      return makePrepared(sql, nextArgs);
    },
    async first() {
      statements.push({ sql, args, kind: "read" });
      if (/SELECT merchant FROM merchant_offers/i.test(sql)) return { merchant: offerMerchant };
      return null;
    },
    async run() {
      statements.push({ sql, args, kind: "write" });
      return { success: true };
    },
  });

  return {
    statements,
    DB: {
      prepare(sql: string) {
        return makePrepared(sql);
      },
      async batch(items: FakePrepared[]) {
        for (const item of items) statements.push({ sql: item.sql, args: item.args, kind: "write" });
        return items.map(() => ({ success: true }));
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

  it("replaces the complete link set so removed affiliate mappings cannot remain stale", async () => {
    const db = fakeDb();
    const stored = await upsertCommercialConfiguration({
      env: { DB: db.DB as never },
      program,
      links: [
        link,
        { offerId: "offer-2", destinationUrl: "https://affiliate.example/item-2" },
      ],
    });

    expect(stored.linkedOfferIds).toEqual(["offer-1", "offer-2"]);
    const writes = db.statements.filter((item) => item.kind === "write");
    const deleteIndex = writes.findIndex((item) => /DELETE FROM attribution_links WHERE program_id/i.test(item.sql));
    const linkIndexes = writes
      .map((item, index) => (/INSERT INTO attribution_links/i.test(item.sql) ? index : -1))
      .filter((index) => index >= 0);
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(linkIndexes).toHaveLength(2);
    expect(linkIndexes.every((index) => index > deleteIndex)).toBe(true);
  });

  it("rejects duplicate offer mappings before any commercial write", async () => {
    const db = fakeDb();
    await expect(upsertCommercialConfiguration({
      env: { DB: db.DB as never },
      program,
      links: [link, { ...link, destinationUrl: "https://affiliate.example/other" }],
    })).rejects.toThrow("COMMERCIAL_DUPLICATE_OFFER_LINK");
    expect(db.statements.filter((item) => item.kind === "write")).toEqual([]);
  });
});
