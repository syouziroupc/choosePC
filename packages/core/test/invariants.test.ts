import { describe, expect, it } from "vitest";
import { resolveHardware } from "../src/catalog";
import { evaluatePc } from "../src/evaluation";
import { USE_CASES } from "../src/presets";
import { scoreMarketValue } from "../src/scoring";
import type { NormalizedPC } from "../src/types";

const observedMarket = { fairPriceJpy: 100000, source: "observed_market" as const, sampleCount: 25, confidence: 86, ageDays: 5 };

function laptop(overrides: Partial<NormalizedPC> = {}): NormalizedPC {
  return {
    category: "general_laptop",
    cpu: { raw: "Intel Core i5-1235U", confidence: 95 },
    gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 95 },
    memory: { sizeGb: 16, upgradeable: false },
    storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
    display: { refreshHz: 60 },
    mobility: { weightKg: 1.2 },
    condition: { type: "used", grade: "A", batteryHealthPct: 85, defects: [] },
    commerce: { priceJpy: 70000, warrantyDays: 90 },
    confidence: {},
    extra: { upgradeabilityScore: 55 },
    ...overrides,
  };
}

function evaluate(pc: NormalizedPC) {
  return evaluatePc({
    pc,
    profile: USE_CASES.office,
    hardware: resolveHardware(pc.cpu?.raw, pc.gpu?.raw, pc.gpu?.tgpW, { cpuConfidence: pc.cpu?.confidence, gpuConfidence: pc.gpu?.confidence }),
    market: observedMarket,
    context: "purchase",
  });
}

describe("decision-engine invariants", () => {
  it("never makes market-value score worse when the same product gets cheaper", () => {
    let previous = -1;
    for (const price of [160000, 140000, 125000, 115000, 108000, 100000, 95000, 85000, 75000, 60000]) {
      const value = scoreMarketValue(price, observedMarket);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("never reduces the same laptop GPU capability when TGP rises within the supported range", () => {
    let previous = -1;
    for (const tgp of [35, 45, 60, 80, 100, 115]) {
      const hardware = resolveHardware("AMD Ryzen 5 5600H", "GeForce RTX 4060 Laptop", tgp);
      expect(hardware.gpu).not.toBeNull();
      expect(hardware.gpu!.gaming1080).toBeGreaterThanOrEqual(previous);
      previous = hardware.gpu!.gaming1080;
    }
  });

  it("does not increase confidence when essential CPU identity is removed", () => {
    const known = evaluate(laptop());
    const missingPc = laptop({ cpu: { raw: "Unknown CPU", confidence: 0 } });
    const missing = evaluate(missingPc);
    expect(missing.scores.confidence).toBeLessThan(known.scores.confidence);
    expect(missing.decision).toBe("insufficient_data");
  });

  it("cannot rescue an essential RAM failure solely through a huge price discount", () => {
    for (const price of [50000, 30000, 10000, 1000]) {
      const pc = laptop({ memory: { sizeGb: 4, upgradeable: false }, commerce: { priceJpy: price, warrantyDays: 90 } });
      const result = evaluate(pc);
      expect(result.decision).toBe("avoid");
    }
  });

  it("keeps risk non-improving when known defects are added", () => {
    const clean = evaluate(laptop());
    const one = evaluate(laptop({ condition: { type: "used", grade: "A", batteryHealthPct: 85, defects: ["keyboard"] } }));
    const two = evaluate(laptop({ condition: { type: "used", grade: "A", batteryHealthPct: 85, defects: ["keyboard", "display"] } }));
    expect(one.scores.risk).toBeGreaterThanOrEqual(clean.scores.risk);
    expect(two.scores.risk).toBeGreaterThanOrEqual(one.scores.risk);
  });
});
