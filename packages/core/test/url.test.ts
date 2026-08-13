import { describe, expect, it } from "vitest";
import { extractProductPage } from "../src/url";

describe("product page extraction", () => {
  it("prefers the main Product JSON-LD over unrelated recommendation text", () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Gaming 16 Ryzen 5 5600H RTX 4060 Laptop 16GB RAM 512GB SSD",
        description: "GeForce RTX 4060 Laptop / Ryzen 5 5600H / RAM 16GB / NVMe SSD 512GB",
        brand: { "@type": "Brand", name: "Example" },
        model: "G16-4060",
        offers: { "@type": "Offer", price: "119800", priceCurrency: "JPY" },
      })}</script></head><body>
      <section>おすすめ商品：Ryzen 7 7800X3D / GeForce RTX 4060 / 259800円</section>
    </body></html>`;
    const result = extractProductPage(html, "https://example.test/item");
    expect(result.cpuRaw).toBe("AMD Ryzen 5 5600H");
    expect(result.gpuRaw).toBe("GeForce RTX 4060 Laptop");
    expect(result.priceJpy).toBe(119800);
    expect(result.manufacturer).toBe("Example");
    expect(result.model).toBe("G16-4060");
    expect(result.confidence.price).toBeGreaterThan(90);
  });

  it("handles Product objects nested inside @graph", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "Shop" },
        { "@type": "Product", name: "Office PC Core i5-1235U memory 16GB SSD 512GB", offers: [{ "@type": "Offer", price: 59800 }] },
      ],
    })}</script>`;
    const result = extractProductPage(html, "https://example.test/item2");
    expect(result.cpuRaw).toBe("Intel Core i5-1235U");
    expect(result.ramGb).toBe(16);
    expect(result.storageGb).toBe(512);
    expect(result.priceJpy).toBe(59800);
  });

  it("falls back without inventing unknown components", () => {
    const html = `<html><head><meta property="og:title" content="Mystery PC 16GB RAM SSD 512GB ￥39800"></head><body>No CPU model is listed.</body></html>`;
    const result = extractProductPage(html, "https://example.test/item3");
    expect(result.cpuRaw).toBeNull();
    expect(result.gpuRaw).toBeNull();
    expect(result.ramGb).toBe(16);
    expect(result.storageGb).toBe(512);
    expect(result.priceJpy).toBe(39800);
  });

  it("ignores broken JSON-LD and still uses safe metadata fallback", () => {
    const html = `<html><head><script type="application/ld+json">{broken</script><meta property="og:title" content="Core i5-1135G7 memory 8GB SSD 256GB ￥34800"></head></html>`;
    const result = extractProductPage(html, "https://example.test/item4");
    expect(result.cpuRaw).toBe("Intel Core i5-1135G7");
    expect(result.priceJpy).toBe(34800);
  });
});
