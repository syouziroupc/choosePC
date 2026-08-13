import { describe, expect, it } from "vitest";
import { CPU_CATALOG, GPU_CATALOG, resolveHardware } from "../src/catalog";
import { extractMetric } from "../src/scoring";
import type { NormalizedPC } from "../src/types";

describe("hardware knowledge coverage", () => {
  it("keeps a broad CPU/GPU corpus instead of regressing to a demo-sized catalog", () => {
    expect(CPU_CATALOG.length).toBeGreaterThanOrEqual(200);
    expect(GPU_CATALOG.length).toBeGreaterThanOrEqual(120);
  });

  it.each([
    ["Intel Core i5-8250U", "intel-core-i5-8250u"],
    ["Intel Core i5-12400F", "intel-core-i5-12400f"],
    ["Intel Core i7-14700HX", "intel-core-i7-14700hx"],
    ["Intel Core Ultra 7 155H", "intel-core-ultra-7-155h"],
    ["AMD Ryzen 5 5600U", "amd-ryzen-5-5600u"],
    ["AMD Ryzen 7 7840U", "amd-ryzen-7-7840u"],
    ["AMD Ryzen AI 9 HX 370", "amd-ryzen-ai-9-hx-370"],
    ["AMD Ryzen 7 9800X3D", "amd-ryzen-7-9800x3d"],
    ["Apple M4 Pro", "apple-m4-pro"],
  ])("recognizes CPU %s", (raw, expectedId) => {
    expect(resolveHardware(raw, null).cpuId).toBe(expectedId);
  });

  it.each([
    ["GeForce RTX 4060", "geforce-rtx-4060-desktop"],
    ["GeForce RTX 4060 Ti", "geforce-rtx-4060-ti-desktop"],
    ["GeForce RTX 4060 Laptop GPU", "geforce-rtx-4060-laptop"],
    ["GeForce RTX 5070 Ti Laptop GPU", "geforce-rtx-5070-ti-laptop"],
    ["AMD Radeon RX 7800 XT", "amd-radeon-rx-7800-xt-desktop"],
    ["AMD Radeon RX 9070 XT", "amd-radeon-rx-9070-xt-desktop"],
    ["Intel Arc B580", "intel-arc-b580-desktop"],
    ["Intel Arc A770M", "intel-arc-a770m-laptop"],
    ["Intel UHD Graphics 620", "intel-uhd-graphics-620-integrated"],
    ["AMD Radeon 780M", "amd-radeon-780m-integrated"],
  ])("recognizes GPU %s", (raw, expectedId) => {
    expect(resolveHardware(null, raw).gpuId).toBe(expectedId);
  });

  it("prefers the longer exact model family instead of a shorter substring model", () => {
    expect(resolveHardware("Intel Core i5-12400F", null).cpuId).not.toBe("intel-core-i5-12400");
    expect(resolveHardware(null, "GeForce RTX 4060 Ti").gpuId).not.toBe("geforce-rtx-4060-desktop");
    expect(resolveHardware(null, "GeForce RTX 4070 Ti SUPER").gpuId).toBe("geforce-rtx-4070-ti-super-desktop");
  });

  it("uses catalog VRAM only when the model has one unambiguous memory capacity", () => {
    expect(resolveHardware(null, "GeForce RTX 4060").gpuVramGb).toBe(8);
    expect(resolveHardware(null, "GeForce RTX 4060 Ti").gpuVramGb).toBeNull();
    expect(resolveHardware(null, "GeForce RTX 4060 Laptop GPU").gpuVramGb).toBe(8);
    expect(resolveHardware(null, "GeForce RTX 3050 Laptop GPU").gpuVramGb).toBeNull();
  });

  it("makes fixed catalog VRAM available to use-case requirements without overwriting explicit PC data", () => {
    const pc: NormalizedPC = {
      category: "gaming_desktop",
      gpu: { raw: "GeForce RTX 4060", variant: "desktop", vramGb: null, confidence: 95 },
      condition: { type: "new", defects: [] },
      commerce: {},
      confidence: {},
    };
    const hardware = resolveHardware(null, pc.gpu?.raw);
    expect(extractMetric("vramGb", pc, hardware)).toBe(8);
    pc.gpu!.vramGb = 12;
    expect(extractMetric("vramGb", pc, hardware)).toBe(12);
  });
});
