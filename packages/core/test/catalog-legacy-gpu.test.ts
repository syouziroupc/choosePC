import { describe, expect, it } from "vitest";
import { GPU_CATALOG, resolveHardware } from "../src/catalog";

describe("legacy desktop GPU coverage", () => {
  it("covers GTX 600 / Radeon HD 7000 and the generations up to the existing catalog", () => { expect(GPU_CATALOG.length).toBeGreaterThanOrEqual(240); });
  it.each([
    ["NVIDIA GeForce GTX 650 Ti BOOST 2GB", "geforce-gtx-650-ti-boost-desktop"],
    ["GTX680", "geforce-gtx-680-desktop"],
    ["GeForce GTX 780 Ti", "geforce-gtx-780-ti-desktop"],
    ["NVIDIA GTX 970 4GB", "geforce-gtx-970-desktop"],
    ["Radeon HD7970", "amd-radeon-hd-7970-desktop"],
    ["AMD Radeon HD 7970 GHz Edition", "amd-radeon-hd-7970-ghz-desktop"],
    ["R9 290X", "amd-radeon-r9-290x-desktop"],
    ["Radeon RX480 8GB", "amd-radeon-rx-480-desktop"],
  ])("recognizes %s", (raw, expectedId) => { expect(resolveHardware(null, raw).gpuId).toBe(expectedId); });
});
