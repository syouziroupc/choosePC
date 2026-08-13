import { describe, expect, it } from "vitest";
import worker from "../src/index";

type Limiter = { limit: (args: { key: string }) => Promise<{ success: boolean }> };

function env(success = true) {
  return {
    URL_INSPECT_LIMITER: {
      async limit() { return { success }; },
    } satisfies Limiter,
  };
}

async function requestJson(path: string, body: unknown, limiterSuccess = true) {
  const response = await worker.fetch(
    new Request(`https://choosepc.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env(limiterSuccess) as never,
  );
  return { response, data: await response.json() as Record<string, unknown> };
}

const basePc = {
  category: "general_laptop",
  cpu: { raw: "Intel Core i5-1235U", confidence: 95 },
  gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 95 },
  memory: { sizeGb: 16, upgradeable: false },
  storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
  display: { refreshHz: 60 },
  mobility: { weightKg: 1.2 },
  condition: { type: "used", grade: "A", batteryHealthPct: 85, defects: [] },
  commerce: { priceJpy: 45000, warrantyDays: 90 },
  confidence: {},
  extra: { upgradeabilityScore: 50 },
};

describe("Worker API boundary", () => {
  it("reports health", async () => {
    const response = await worker.fetch(new Request("https://choosepc.test/api/v1/health"), env() as never);
    expect(response.status).toBe(200);
    const data = await response.json() as { ok: boolean; engine: string };
    expect(data.ok).toBe(true);
    expect(data.engine).toBe("0.2.0");
  });

  it("evaluates only server-managed use cases", async () => {
    const good = await requestJson("/api/v1/evaluate", {
      pc: basePc,
      useCase: "office",
      market: { fairPriceJpy: 50000, source: "observed_market", sampleCount: 12, confidence: 80, ageDays: 4 },
    });
    expect(good.response.status).toBe(200);
    expect(good.data).toHaveProperty("result");

    const bad = await requestJson("/api/v1/evaluate", { pc: basePc, useCase: "client-defined-super-score" });
    expect(bad.response.status).toBe(400);
    expect(bad.data.error).toBe("INVALID_USE_CASE");
  });

  it("rejects invalid numeric payloads before evaluation", async () => {
    const badPc = { ...basePc, memory: { sizeGb: 100000 } };
    const { response, data } = await requestJson("/api/v1/evaluate", { pc: badPc, useCase: "office" });
    expect(response.status).toBe(400);
    expect(data.error).toBe("INVALID_PC");
  });

  it("rate-limits URL inspection before any remote fetch", async () => {
    const { response, data } = await requestJson("/api/v1/url/inspect", { url: "https://www.amazon.co.jp/example" }, false);
    expect(response.status).toBe(429);
    expect(data.error).toBe("RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("limits recommendation batch size and duplicate identifiers", async () => {
    const duplicate = await requestJson("/api/v1/recommend", {
      useCase: "office",
      candidates: [
        { candidateId: "same", pc: basePc },
        { candidateId: "same", pc: basePc },
      ],
    });
    expect(duplicate.response.status).toBe(400);
    expect(duplicate.data.error).toBe("INVALID_CANDIDATES");
  });

  it("returns a neutral ranked recommendation without commercial fields", async () => {
    const stronger = { ...basePc, commerce: { priceJpy: 42000, warrantyDays: 90 } };
    const weaker = { ...basePc, memory: { sizeGb: 8, upgradeable: false }, commerce: { priceJpy: 59000, warrantyDays: 30 } };
    const { response, data } = await requestJson("/api/v1/recommend", {
      useCase: "office",
      candidates: [
        { candidateId: "weaker", pc: weaker, market: { fairPriceJpy: 48000, source: "observed_market", sampleCount: 12, confidence: 80, ageDays: 4 } },
        { candidateId: "stronger", pc: stronger, market: { fairPriceJpy: 48000, source: "observed_market", sampleCount: 12, confidence: 80, ageDays: 4 } },
      ],
    });
    expect(response.status).toBe(200);
    const ranked = data.ranked as Array<Record<string, unknown>>;
    expect(ranked[0].candidateId).toBe("stronger");
    expect(ranked[0]).not.toHaveProperty("affiliate");
    expect(ranked[0]).not.toHaveProperty("commission");
    expect(ranked[0]).not.toHaveProperty("merchant");
  });
});
