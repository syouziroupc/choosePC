import { describe, expect, it } from "vitest";
import entry from "../src/entry";

function request(body: unknown) {
  return new Request("https://choosepc.test/api/internal/commercial/upsert", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer commercial-secret",
    },
    body: JSON.stringify(body),
  });
}

const program = {
  key: "affiliate-main",
  merchant: "Example Shop",
  programType: "affiliate",
  status: "active",
  disclosureText: "広告リンクを含みます。",
  sourceUrl: "https://partner.example/program",
};

describe("commercial administration boundary", () => {
  it("rejects duplicate offer mappings as a client error before touching D1", async () => {
    let prepared = false;
    const DB = {
      prepare() {
        prepared = true;
        throw new Error("DB_SHOULD_NOT_BE_TOUCHED");
      },
    };

    const response = await entry.fetch(
      request({
        program,
        links: [
          { offerId: "offer-1", destinationUrl: "https://affiliate.example/item-a" },
          { offerId: "offer-1", destinationUrl: "https://affiliate.example/item-b" },
        ],
      }),
      {
        URL_INSPECT_LIMITER: { async limit() { return { success: true }; } },
        COMMERCIAL_ADMIN_TOKEN: "commercial-secret",
        DB,
      } as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_COMMERCIAL_CONFIGURATION" });
    expect(prepared).toBe(false);
  });
});
