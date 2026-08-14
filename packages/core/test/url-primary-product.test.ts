import { describe, expect, it } from "vitest";
import { extractProductPage } from "../src/url";

describe("primary product JSON-LD selection", () => {
  it("does not let an earlier recommendation Product replace the page's main PC", () => {
    const recommendation = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Recommended Gaming PC Ryzen 7 7800X3D RTX 4070 32GB RAM 1TB SSD",
      url: "https://shop.example.test/recommended-4070",
      brand: { "@type": "Brand", name: "OtherBrand" },
      model: "REC-4070",
      offers: { "@type": "Offer", price: "249800", priceCurrency: "JPY" },
    };
    const primary = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "ThinkBook 14 Intel Core i5-1235U 16GB RAM 512GB SSD",
      url: "https://shop.example.test/products/thinkbook-14?campaign=summer",
      brand: { "@type": "Brand", name: "Lenovo" },
      model: "ThinkBook-14-I5",
      offers: { "@type": "Offer", price: "79800", priceCurrency: "JPY" },
    };
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="ThinkBook 14 Intel Core i5-1235U 16GB RAM 512GB SSD">
      <script type="application/ld+json">${JSON.stringify(recommendation)}</script>
      <script type="application/ld+json">${JSON.stringify(primary)}</script>
    </head><body></body></html>`;

    const result = extractProductPage(html, "https://shop.example.test/products/thinkbook-14");
    expect(result.title).toContain("ThinkBook 14");
    expect(result.manufacturer).toBe("Lenovo");
    expect(result.model).toBe("ThinkBook-14-I5");
    expect(result.cpuRaw).toBe("Intel Core i5-1235U");
    expect(result.priceJpy).toBe(79800);
  });

  it("uses title affinity when structured Product URLs are absent", () => {
    const html = `<!doctype html><html><head>
      <title>OfficeBook Core i5-1135G7 16GB RAM SSD 512GB</title>
      <script type="application/ld+json">${JSON.stringify([
        {
          "@type": "Product",
          name: "Accessory bundle 16GB RAM SSD 512GB",
          offers: { "@type": "Offer", price: "12800", priceCurrency: "JPY" },
        },
        {
          "@type": "Product",
          name: "OfficeBook Core i5-1135G7 16GB RAM SSD 512GB",
          model: "OFFICEBOOK-1135",
          offers: { "@type": "Offer", price: "54800", priceCurrency: "JPY" },
        },
      ])}</script>
    </head><body></body></html>`;

    const result = extractProductPage(html, "https://shop.example.test/products/officebook");
    expect(result.model).toBe("OFFICEBOOK-1135");
    expect(result.cpuRaw).toBe("Intel Core i5-1135G7");
    expect(result.priceJpy).toBe(54800);
  });
});
