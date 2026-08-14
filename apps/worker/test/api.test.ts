import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "../../../packages/core/src/index";
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

const userEstimate = { fairPriceJpy: 50000, source: "user_estimate", sampleCount: 1, confidence: 40, ageDays: 0 };

describe("Worker API boundary", () => {
  it("reports health", async () => {
    const response = await worker.fetch(new Request("https://choosepc.test/api/v1/health"), env() as never);
    expect(response.status).toBe(200);
    const data = await response.json() as { ok: boolean; engine: string };
    expect(data.ok).toBe(true);
    expect(data.engine).toBe(ENGINE_VERSION);
  });

  it("evaluates only server-managed use cases", async () => {
    const good = await requestJson("/api/v1/evaluate", {
      pc: basePc,
      useCase: "office",
      market: userEstimate,
    });
    expect(good.response.status).toBe(200);
    expect(good.data).toHaveProperty("result");

    const bad = await requestJson("/api/v1/evaluate", { pc: basePc, useCase: "client-defined-super-score" });
    expect(bad.response.status).toBe(400);
    expect(bad.data.error).toBe("INVALID_USE_CASE");
  });

  it("rejects clients that spoof observed-market provenance", async () => {
    const { response, data } = await requestJson("/api/v1/evaluate", {
      pc: basePc,
      useCase: "office",
      market: { fairPriceJpy: 50000, source: "observed_market", sampleCount: 20, confidence: 95, ageDays: 0 },
    });
    expect(response.status).toBe(400);
    expect(data.error).toBe("INVALID_MARKET");
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

  it("computes robust market estimates without promoting client observations", async () => {
    const now = Date.now();
    const obs = (priceJpy: number, ageDays: number, similarity = 0.95, sourceConfidence = 0.9) => ({
      priceJpy,
      observedAt: new Date(now - ageDays * 86_400_000).toISOString(),
      similarity,
      sourceConfidence,
    });
    const { response, data } = await requestJson("/api/v1/market/estimate", {
      observations: [
        obs(40000, 2),
        obs(41000, 3),
        obs(42000, 4),
        obs(43000, 5),
        obs(180000, 5),
        obs(90000, 180, 0.4, 0.5),
      ],
    });
    expect(response.status).toBe(200);
    const market = data.market as { estimate: { fairPriceJpy: number } | null; rejectedSamples: number };
    expect(market.estimate).not.toBeNull();
    expect(market.estimate!.fairPriceJpy).toBeLessThan(50000);
    expect(market.rejectedSamples).toBeGreaterThanOrEqual(1);
    expect(data.reusableAsObservedEvidence).toBe(false);
  });

  it("rejects malformed market observations", async () => {
    const { response, data } = await requestJson("/api/v1/market/estimate", {
      observations: [{ priceJpy: -1, observedAt: "bad", similarity: 2, sourceConfidence: 3 }],
    });
    expect(response.status).toBe(400);
    expect(data.error).toBe("INVALID_MARKET_OBSERVATIONS");
  });

  it("returns no stored market evidence when D1 is not bound", async () => {
    const { response, data } = await requestJson("/api/v1/market/lookup", { pc: basePc });
    expect(response.status).toBe(200);
    expect(data.market).toBeNull();
  });

  it("conceals the trusted market-ingest endpoint without its secret", async () => {
    const response = await worker.fetch(
      new Request("https://choosepc.test/api/internal/market/observe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ observation: { pc: basePc, priceJpy: 45000, observedAt: new Date().toISOString(), source: "retailer_listing" } }),
      }),
      env() as never,
    );
    expect(response.status).toBe(404);
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
    const market = { fairPriceJpy: 48000, source: "user_estimate", sampleCount: 1, confidence: 40, ageDays: 0 };
    const { response, data } = await requestJson("/api/v1/recommend", {
      useCase: "office",
      candidates: [
        { candidateId: "weaker", pc: weaker, market },
        { candidateId: "stronger", pc: stronger, market },
      ],
    });
    expect(response.status).toBe(200);
    const ranked = data.ranked as Array<Record<string, unknown>>;
    expect(ranked[0].candidateId).toBe("stronger");
    expect(ranked[0]).not.toHaveProperty("affiliate");
    expect(ranked[0]).not.toHaveProperty("commission");
    expect(ranked[0]).not.toHaveProperty("merchant");
    expect(data.commercialOffers).toEqual([]);
  });
});
