import { describe, expect, it } from "vitest";
import { createProductSignature, signatureSimilarity } from "../src/signature";
import { resolveHardware } from "../src/catalog";
import type { NormalizedPC } from "../src/types";

function pc(overrides: Partial<NormalizedPC> = {}): NormalizedPC {
  return {
    manufacturer: "Lenovo",
    model: "ThinkPad T14 Gen 2",
    category: "general_laptop",
    cpu: { raw: "AMD Ryzen 5 5600U", confidence: 95 },
    gpu: { raw: "Intel Iris Xe Graphics", variant: "integrated", confidence: 95 },
    memory: { sizeGb: 16 },
    storage: [{ kind: "nvme_ssd", sizeGb: 512 }],
    condition: { type: "used", grade: "B" },
    commerce: {},
    confidence: {},
    ...overrides,
  };
}

describe("product signatures", () => {
  it("creates stable exact-model signatures for matching product configurations", () => {
    const a = pc();
    const b = pc({ manufacturer: " LENOVO ", model: "ThinkPad T14 Gen 2" });
    const sa = createProductSignature(a, resolveHardware(a.cpu?.raw, a.gpu?.raw));
    const sb = createProductSignature(b, resolveHardware(b.cpu?.raw, b.gpu?.raw));
    expect(sa.key).toBe(sb.key);
    expect(sa.quality).toBe("exact_model");
  });

  it("separates materially different RAM configurations", () => {
    const a = pc({ memory: { sizeGb: 8 } });
    const b = pc({ memory: { sizeGb: 32 } });
    const sa = createProductSignature(a, resolveHardware(a.cpu?.raw, a.gpu?.raw));
    const sb = createProductSignature(b, resolveHardware(b.cpu?.raw, b.gpu?.raw));
    expect(sa.key).not.toBe(sb.key);
    expect(signatureSimilarity(sa, sb)).toBeLessThan(1);
  });

  it("does not consider new and used observations comparable", () => {
    const used = pc({ condition: { type: "used" } });
    const fresh = pc({ condition: { type: "new" } });
    const su = createProductSignature(used, resolveHardware(used.cpu?.raw, used.gpu?.raw));
    const sn = createProductSignature(fresh, resolveHardware(fresh.cpu?.raw, fresh.gpu?.raw));
    expect(signatureSimilarity(su, sn)).toBe(0);
  });

  it("falls back to configuration identity for BTO systems without a model", () => {
    const machine = pc({ manufacturer: null, model: null, category: "bto_desktop", cpu: { raw: "AMD Ryzen 5 7600", confidence: 95 }, gpu: { raw: "GeForce RTX 4060", variant: "desktop", vramGb: 8, confidence: 95 }, memory: { sizeGb: 32 } });
    const signature = createProductSignature(machine, resolveHardware(machine.cpu?.raw, machine.gpu?.raw));
    expect(signature.quality).toBe("configuration");
    expect(signature.key).toContain("amd-r5-7600");
    expect(signature.key).toContain("nvidia-rtx4060-desktop");
  });

  it("does not treat two information-poor signatures as a perfect match", () => {
    const a = pc({ manufacturer: null, model: null, cpu: null, gpu: null, memory: null, storage: [] });
    const b = pc({ manufacturer: null, model: null, cpu: null, gpu: null, memory: null, storage: [] });
    const sa = createProductSignature(a, resolveHardware(null, null));
    const sb = { ...createProductSignature(b, resolveHardware(null, null)), key: "different-partial-key" };
    expect(signatureSimilarity(sa, sb)).toBeLessThan(0.55);
  });

  it("matches nearby performance tiers without pretending they are identical", () => {
    const a = pc({ manufacturer: null, model: null, cpu: { raw: "Intel Core i5-1235U", confidence: 95 } });
    const b = pc({ manufacturer: null, model: null, cpu: { raw: "Intel Core i5-1335U", confidence: 95 } });
    const distant = pc({ manufacturer: null, model: null, cpu: { raw: "Intel Core 2 Duo E8400", confidence: 95 } });
    const sa = createProductSignature(a, resolveHardware(a.cpu?.raw, a.gpu?.raw));
    const sb = createProductSignature(b, resolveHardware(b.cpu?.raw, b.gpu?.raw));
    const sd = createProductSignature(distant, resolveHardware(distant.cpu?.raw, distant.gpu?.raw));
    expect(signatureSimilarity(sa, sb)).toBeGreaterThan(signatureSimilarity(sa, sd));
    expect(signatureSimilarity(sa, sb)).toBeLessThan(1);
  });
});
