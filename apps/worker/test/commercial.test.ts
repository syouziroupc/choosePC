import { describe, expect, it } from "vitest";
import { resolveCommercialPresentations, resolveOutboundDestination } from "../src/commercial";

type Row = {
  offer_id: string;
  merchant: string;
  title: string;
  price_jpy: number;
  product_url: string;
  program_id: string | null;
  attribution_id: string | null;
  program_type: "own" | "affiliate" | "normal" | null;
  program_status: string | null;
  destination_url: string | null;
  disclosure_text: string | null;
  click_ref_param?: string | null;
};

function fakeDb(rows: Row[]) {
  let sql = "";
  return {
    get sql() { return sql; },
    DB: {
      prepare(query: string) {
        sql = query;
        return {
          bind() {
            return {
              async all() { return { results: rows }; },
            };
          },
        };
      },
    },
  };
}

const base = {
  offer_id: "offer-1",
  merchant: "Example Shop",
  title: "Example PC",
  price_jpy: 42000,
  product_url: "https://shop.example/item",
};

describe("commercial resolution", () => {
  it("joins programs only when merchant identity matches the offer merchant", async () => {
    const db = fakeDb([{ ...base, program_id: null, attribution_id: null, program_type: null, program_status: null, destination_url: null, disclosure_text: null }]);
    await resolveCommercialPresentations({
      env: { DB: db.DB as never },
      ranked: [{ offerId: "offer-1", rank: 1, evaluationScore: 88 }],
    });
    expect(db.sql).toMatch(/lower\(trim\(cp\.merchant\)\)\s*=\s*lower\(trim\(mo\.merchant\)\)/i);
  });

  it("selects active commercial destinations deterministically after rank is frozen", async () => {
    const rows: Row[] = [
      {
        ...base,
        program_id: "affiliate-b",
        attribution_id: "link-b",
        program_type: "affiliate",
        program_status: "active",
        destination_url: "https://affiliate.example/b",
        disclosure_text: "広告リンクを含みます。",
        click_ref_param: "subid",
      },
      {
        ...base,
        program_id: "own-z",
        attribution_id: "link-z",
        program_type: "own",
        program_status: "active",
        destination_url: "https://own.example/z",
        disclosure_text: "自社取扱商品です。",
      },
      {
        ...base,
        program_id: "own-a",
        attribution_id: "link-a",
        program_type: "own",
        program_status: "active",
        destination_url: "https://own.example/a",
        disclosure_text: "自社取扱商品です。",
      },
    ];
    const db = fakeDb(rows);
    const presentation = await resolveCommercialPresentations({
      env: { DB: db.DB as never },
      ranked: [{ offerId: "offer-1", rank: 1, evaluationScore: 88 }],
    });
    expect(presentation[0]).toMatchObject({
      offerId: "offer-1",
      rank: 1,
      evaluationScore: 88,
      merchantType: "own",
      disclosureRequired: true,
    });
    const destination = await resolveOutboundDestination({ DB: db.DB as never }, "offer-1");
    expect(destination).toMatchObject({
      merchantType: "own",
      destinationUrl: "https://own.example/a",
      programId: "own-a",
      clickRefParam: null,
    });
  });

  it("falls back to the neutral product URL when no active program is usable", async () => {
    const db = fakeDb([{
      ...base,
      program_id: "paused",
      attribution_id: "link",
      program_type: "affiliate",
      program_status: "paused",
      destination_url: "https://affiliate.example/paused",
      disclosure_text: "広告リンクを含みます。",
      click_ref_param: "subid",
    }]);
    const destination = await resolveOutboundDestination({ DB: db.DB as never }, "offer-1");
    expect(destination).toEqual({
      offerId: "offer-1",
      merchant: "Example Shop",
      merchantType: "normal",
      destinationUrl: "https://shop.example/item",
      programId: null,
      clickRefParam: null,
    });
  });
});
