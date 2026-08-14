import { describe, expect, it } from "vitest";
import { decideReplacement } from "../src/replacement";
import { evaluatePc } from "../src/evaluation";
import { resolveHardware } from "../src/catalog";
import { USE_CASES } from "../src/presets";
import type { EvaluationResult, HardConstraint, NormalizedPC } from "../src/types";

const pc: NormalizedPC = { category: "general_laptop", memory: { sizeGb: 8, upgradeable: true }, storage: [{ kind: "nvme_ssd", sizeGb: 256 }], condition: { type: "used", defects: [] }, commerce: {}, confidence: {}, extra: { upgradeabilityScore: 80 } };
function ev(fit: number, longevity: number, risk = 10, constraints: HardConstraint[] = []): EvaluationResult {
  return { scores: { overall: fit, hardware: fit, fit, value: 50, condition: 70, longevity, risk, confidence: 85 }, decision: "fair", reasons: [], reasonDetails: [], warnings: [], constraints, engineVersion: "x", knowledgeVersion: "x" };
}

describe("replacement assistant", () => {
  it("prefers keeping a sufficiently capable current PC", () => expect(decideReplacement(pc, ev(84, 75)).decision).toBe("keep"));
  it("prefers an upgrade when the base machine is usable and upgradeable", () => expect(decideReplacement(pc, ev(63, 55)).decision).toBe("upgrade"));
  it("recommends replacement when fit is too low", () => expect(decideReplacement(pc, ev(35, 30)).decision).toBe("replace"));

  it("does not let an upgradeable RAM/storage configuration hide a known critical CPU failure", () => {
    const result = decideReplacement(pc, ev(63, 55, 20, [{
      code: "below_min:cpuGeneral",
      severity: "critical",
      known: true,
      message: "CPU does not meet minimum",
    }]));
    expect(result.decision).toBe("replace");
    expect(result.urgency).toBeGreaterThanOrEqual(80);
  });

  it("routes a known PSU insufficiency to repair or inspection before replacement", () => {
    const desktop: NormalizedPC = {
      ...pc,
      category: "gaming_desktop",
      extra: { upgradeabilityScore: 80, psuWatts: 450, recommendedPsuWatts: 650 },
    };
    const result = decideReplacement(desktop, ev(80, 70, 95, [{
      code: "desktop:psu_insufficient",
      severity: "critical",
      known: true,
    }]));
    expect(result.decision).toBe("repair_or_inspect");
    expect(result.urgency).toBe(85);
  });

  it("still recommends a memory upgrade when RAM is the only known critical failure and expansion is possible", () => {
    const result = decideReplacement(pc, ev(60, 55, 20, [{
      code: "below_min:ramGb",
      severity: "critical",
      known: true,
    }]));
    expect(result.decision).toBe("upgrade");
  });

  it("does not require market price evidence to decide whether an owned PC can be kept", () => {
    const currentPc: NormalizedPC = {
      category: "general_laptop",
      cpu: { raw: "Intel Core i5-1235U", confidence: 80 },
      gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 70 },
      memory: { sizeGb: 16, upgradeable: false },
      storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
      display: { refreshHz: 60 },
      mobility: { weightKg: 1.2 },
      condition: { type: "used", grade: "A", batteryHealthPct: 85, defects: [] },
      commerce: { priceJpy: null, warrantyDays: 0 },
      confidence: {},
      extra: { upgradeabilityScore: 50, platformAgeYears: 3, osSupportYears: 4 },
    };
    const evaluation = evaluatePc({
      pc: currentPc,
      profile: USE_CASES.office,
      hardware: resolveHardware(currentPc.cpu?.raw, currentPc.gpu?.raw),
      market: null,
      context: "ownership",
    });
    expect(evaluation.scores.confidence).toBeGreaterThanOrEqual(58);
    expect(decideReplacement(currentPc, evaluation).decision).not.toBe("insufficient_data");
  });
});
