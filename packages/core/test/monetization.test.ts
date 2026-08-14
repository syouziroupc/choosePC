import { describe, expect, it } from "vitest";
import { attachCommercialMetadata } from "../src/monetization";

describe("monetization separation", () => {
  it("preserves the already-fixed ranking order", () => {
    const ranked = [
      { offerId: "a", rank: 1, evaluationScore: 92 },
      { offerId: "b", rank: 2, evaluationScore: 89 },
    ];
    const metadata = new Map([
      ["a", { offerId: "a", merchantType: "normal" as const, destinationUrl: "https://example.com/a", disclosureRequired: false }],
      ["b", { offerId: "b", merchantType: "affiliate" as const, destinationUrl: "https://example.com/b", disclosureRequired: true }],
    ]);
    expect(attachCommercialMetadata(ranked, metadata).map((x) => x.offerId)).toEqual(["a", "b"]);
  });
});
