import { describe, expect, it } from "vitest";
import { CPU_CATALOG, resolveHardware } from "../src/catalog";

describe("legacy CPU era coverage", () => {
  it("keeps enough headroom to cover legacy through current CPUs", () => {
    expect(CPU_CATALOG.length).toBeGreaterThanOrEqual(374);
  });

  it.each([
    ["Intel Core 2 Duo E8400", "intel-core-2-duo-e8400"],
    ["Intel Core 2 Quad Q9550", "intel-core-2-quad-q9550"],
    ["Intel Core i5-2520M", "intel-core-i5-2520m"],
    ["Intel Core i7-3770", "intel-core-i7-3770"],
    ["AMD Phenom II X6 1090T", "amd-phenom-ii-x6-1090t"],
    ["AMD FX-6300", "amd-fx-6300"],
    ["AMD FX-8350", "amd-fx-8350"],
    ["AMD FX-9590", "amd-fx-9590"],
  ])("recognizes %s", (raw, expectedId) => {
    expect(resolveHardware(raw, null).cpuId).toBe(expectedId);
  });
});
