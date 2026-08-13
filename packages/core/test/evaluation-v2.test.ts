import { describe, expect, it } from "vitest";
import { evaluatePc } from "../src/evaluation";
import { resolveHardware } from "../src/catalog";
import { USE_CASES } from "../src/presets";
import type { EvaluationInput, NormalizedPC } from "../src/types";

function basePc(overrides: Partial<NormalizedPC> = {}): NormalizedPC {
  return {
    category: "general_laptop",
    cpu: { raw: "Intel Core i5-1235U", confidence: 85 },
    gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 75 },
    memory: { sizeGb: 16, upgradeable: false },
    storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
    display: { refreshHz: 60 },
    mobility: { weightKg: 1.2 },
    condition: { type: "used", grade: "A", batteryHealthPct: 85, defects: [] },
    commerce: { priceJpy: 45000, warrantyDays: 90 },
    confidence: {},
    extra: { upgradeabilityScore: 50, platformAgeYears: 3, osSupportYears: 4 },
    ...overrides,
  };
}

function evaluate(pc: NormalizedPC, useCase = "student", fairPrice = 50000) {
  const input: EvaluationInput = {
    pc,
    profile: USE_CASES[useCase],
    hardware: resolveHardware(pc.cpu?.raw, pc.gpu?.raw, pc.gpu?.tgpW),
    market: { fairPriceJpy: fairPrice, source: "observed_market", sampleCount: 12, confidence: 78, ageDays: 8 },
    engineVersion: "test",
    knowledgeVersion: "test",
  };
  return evaluatePc(input);
}

describe("evaluation engine v0.2 gates", () => {
  it("does not recommend a machine that fails an essential requirement even when cheap", () => {
    const pc = basePc({ memory: { sizeGb: 4, upgradeable: false }, commerce: { priceJpy: 10000, warrantyDays: 90 } });
    const result = evaluate(pc, "student", 45000);
    expect(result.decision).toBe("avoid");
    expect(result.constraints.some((x) => x.code === "below_min:ramGb")).toBe(true);
  });

  it("separates a capable but overpriced machine from an unsuitable one", () => {
    const result = evaluate(basePc({ commerce: { priceJpy: 76000, warrantyDays: 90 } }), "student", 45000);
    expect(result.scores.fit).toBeGreaterThan(70);
    expect(result.decision).toBe("overpriced");
  });

  it("returns insufficient data instead of guessing unknown critical CPU performance", () => {
    const pc = basePc({ cpu: { raw: "Unknown Future CPU", confidence: 20 } });
    const result = evaluate(pc, "student", 45000);
    expect(result.decision).toBe("insufficient_data");
  });

  it("treats insufficient desktop PSU as a hard critical constraint", () => {
    const pc = basePc({
      category: "gaming_desktop",
      cpu: { raw: "AMD Ryzen 5 7600", confidence: 85 },
      gpu: { raw: "GeForce RTX 4060", variant: "desktop", vramGb: 8, confidence: 85 },
      memory: { sizeGb: 32, upgradeable: true },
      extra: { psuWatts: 350, recommendedPsuWatts: 550, upgradeabilityScore: 90, coolingScore: 80 },
    });
    const result = evaluate(pc, "gaming", 90000);
    expect(result.decision).toBe("avoid");
    expect(result.constraints.some((x) => x.code === "desktop:psu_insufficient")).toBe(true);
  });

  it("does not silently treat unknown desktop PSU as verified", () => {
    const pc = basePc({
      category: "gaming_desktop",
      cpu: { raw: "AMD Ryzen 5 7600", confidence: 85 },
      gpu: { raw: "GeForce RTX 4060", variant: "desktop", vramGb: 8, confidence: 85 },
      memory: { sizeGb: 32, upgradeable: true },
      extra: { upgradeabilityScore: 90, coolingScore: 80 },
    });
    const result = evaluate(pc, "gaming", 90000);
    expect(result.warnings.some((x) => x.includes("電源"))).toBe(true);
    expect(result.constraints.some((x) => x.code === "desktop:psu_unknown")).toBe(true);
  });

  it("penalizes low-TGP gaming laptop capability relative to high-TGP configuration", () => {
    const low = resolveHardware("AMD Ryzen 5 5600H", "GeForce RTX 5060 Laptop", 45);
    const high = resolveHardware("AMD Ryzen 5 5600H", "GeForce RTX 5060 Laptop", 100);
    expect(low.gpu!.gaming1080).toBeLessThan(high.gpu!.gaming1080);
    expect(high.gpu!.gaming1080).toBeGreaterThan(70);
  });

  it("warns when gaming-laptop TGP is unknown", () => {
    const pc = basePc({
      category: "gaming_laptop",
      cpu: { raw: "AMD Ryzen 5 5600H", confidence: 85 },
      gpu: { raw: "GeForce RTX 4060 Laptop", variant: "laptop", vramGb: 8, tgpW: null, confidence: 80 },
      memory: { sizeGb: 16, upgradeable: true },
      display: { refreshHz: 144 },
      extra: { coolingScore: 70, upgradeabilityScore: 65 },
    });
    const result = evaluate(pc, "gaming", 120000);
    expect(result.warnings.some((x) => x.includes("TGP"))).toBe(true);
    expect(result.scores.risk).toBeGreaterThan(8);
  });

  it("warns and lowers evidence quality when gaming cooling is unknown", () => {
    const pc = basePc({
      category: "gaming_laptop",
      cpu: { raw: "AMD Ryzen 5 5600H", confidence: 85 },
      gpu: { raw: "GeForce RTX 4060 Laptop", variant: "laptop", vramGb: 8, tgpW: 100, confidence: 80 },
      memory: { sizeGb: 16, upgradeable: true },
      display: { refreshHz: 144 },
      extra: { coolingScore: null, upgradeabilityScore: 65 },
    });
    const result = evaluate(pc, "gaming", 120000);
    expect(result.warnings.some((x) => x.includes("冷却"))).toBe(true);
    expect(result.constraints.some((x) => x.code === "gaming:cooling_unknown")).toBe(true);
  });

  it("provisional essential hardware evidence caps confidence and blocks strong_buy", () => {
    const pc = basePc();
    const result = evaluatePc({
      pc: { ...pc, commerce: { ...pc.commerce, priceJpy: 20000 } },
      profile: USE_CASES.office,
      hardware: {
        cpu: { general: 100, single: 100, multi: 100, gaming: 100, efficiency: 100 },
        gpu: null,
        cpuConfidence: 72,
        gpuConfidence: 100,
      },
      market: { fairPriceJpy: 40000, source: "observed_market", sampleCount: 100, confidence: 100, ageDays: 1 },
    });
    expect(result.scores.confidence).toBeLessThanOrEqual(77);
    expect(result.decision).not.toBe("strong_buy");
  });
});
