import { describe, expect, it } from "vitest";
import { CPU_CATALOG, GPU_CATALOG, resolveHardware } from "../src/catalog";

describe("extended real-world hardware coverage", () => {
  it("covers low-end, legacy, workstation and mobile-discrete segments", () => {
    expect(CPU_CATALOG.length).toBeGreaterThanOrEqual(300);
    expect(GPU_CATALOG.length).toBeGreaterThanOrEqual(170);
  });

  it.each([
    ["Intel Core i5-4200U", "intel-core-i5-4200u"],
    ["Intel Core i7-7700HQ", "intel-core-i7-7700hq"],
    ["Intel Processor N100", "intel-processor-n100"],
    ["Intel Core i3-N305", "intel-core-i3-n305"],
    ["Intel Core 5 120U", "intel-core-5-120u"],
    ["Intel Xeon E5-2697A v4", "intel-xeon-e5-2697a-v4"],
    ["Intel Xeon w9-3495X", "intel-xeon-w9-3495x"],
    ["AMD Ryzen Threadripper PRO 7995WX", "amd-threadripper-pro-7995wx"],
  ])("recognizes extended CPU %s", (raw, expectedId) => {
    expect(resolveHardware(raw, null).cpuId).toBe(expectedId);
  });

  it.each([
    ["GeForce MX450", "nvidia-geforce-mx450-laptop"],
    ["GeForce GTX 1060 Laptop", "nvidia-geforce-gtx-1060-laptop"],
    ["AMD Radeon RX 7600M XT", "amd-radeon-rx-7600m-xt-laptop"],
    ["AMD Radeon RX 7800M", "amd-radeon-rx-7800m-laptop"],
    ["NVIDIA Quadro P2000", "nvidia-quadro-p2000-desktop"],
    ["NVIDIA RTX A4000", "nvidia-rtx-a4000-desktop"],
    ["NVIDIA RTX 6000 Ada", "nvidia-rtx-6000-ada-desktop"],
  ])("recognizes extended GPU %s", (raw, expectedId) => {
    expect(resolveHardware(null, raw).gpuId).toBe(expectedId);
  });
});
