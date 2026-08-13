import { describe, expect, it } from "vitest";
import { extractProductPage } from "../src/url";

describe("expanded hardware alias boundaries", () => {
  it("does not detect a short Apple chip alias inside an unrelated product code", () => {
    const html = `<!doctype html><html><head><title>Notebook XM1-2025 16GB SSD 512GB</title></head><body>Model XM1-2025</body></html>`;
    const result = extractProductPage(html, "https://example.test/products/xm1-2025");
    expect(result.cpuRaw).toBeNull();
  });

  it("still recognizes a standalone Apple chip token", () => {
    const html = `<!doctype html><html><head><title>Apple MacBook Pro Apple M4 Pro 24GB SSD 512GB</title></head><body></body></html>`;
    const result = extractProductPage(html, "https://example.test/products/macbook-pro");
    expect(result.cpuRaw).toBe("Apple M4 Pro");
  });

  it("prefers an exact longer GPU model on a product page", () => {
    const html = `<!doctype html><html><head><meta property="og:title" content="Gaming PC Core i7-14700K GeForce RTX 4070 Ti SUPER 32GB RAM SSD 1TB"></head><body></body></html>`;
    const result = extractProductPage(html, "https://example.test/products/gaming-pc");
    expect(result.gpuRaw).toBe("GeForce RTX 4070 Ti SUPER");
  });

  it("does not match a CPU model token embedded in a longer alphanumeric code", () => {
    const html = `<!doctype html><html><head><title>Accessory ABCM4XYZ USB-C Adapter</title></head><body>ABCM4XYZ</body></html>`;
    const result = extractProductPage(html, "https://example.test/products/adapter");
    expect(result.cpuRaw).toBeNull();
  });
});
