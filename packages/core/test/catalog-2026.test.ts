import { describe, expect, it } from "vitest";
import { resolveHardware } from "../src/catalog";

describe("2026 hardware coverage", () => {
  it.each([
    ["Intel Core 5 320", "intel-core-5-320"],
    ["Intel Core Ultra X9 378H", "intel-core-ultra-x9-378h"],
    ["Intel Core Ultra 9 290HX Plus", "intel-core-ultra-9-290hx-plus"],
    ["AMD Ryzen AI 9 HX 475", "amd-ryzen-ai-9-hx-475"],
    ["AMD Ryzen AI Max+ 395", "amd-ryzen-ai-max-plus-395"],
    ["Apple M5 Pro", "apple-m5-pro"],
  ])("recognizes current CPU %s", (raw, expectedId) => {
    expect(resolveHardware(raw, null).cpuId).toBe(expectedId);
  });

  it.each([
    ["AMD Radeon 8050S", "amd-radeon-8050s-integrated"],
    ["AMD Radeon 8060S", "amd-radeon-8060s-integrated"],
  ])("recognizes current integrated GPU %s", (raw, expectedId) => {
    expect(resolveHardware(null, raw).gpuId).toBe(expectedId);
  });

  it("uses declared laptop context to resolve a bare GeForce model as the laptop variant", () => {
    const hardware = resolveHardware(null, "GeForce RTX 4060", null, { gpuVariant: "laptop" });
    expect(hardware.gpuId).toBe("nvidia-rtx4060-laptop");
    expect(hardware.gpuVariant).toBe("laptop");
  });

  it("keeps the stable desktop identity when desktop context is declared", () => {
    const hardware = resolveHardware(null, "GeForce RTX 4060", null, { gpuVariant: "desktop" });
    expect(hardware.gpuId).toBe("nvidia-rtx4060-desktop");
    expect(hardware.gpuVariant).toBe("desktop");
  });
});
