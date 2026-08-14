import { describe, expect, it } from "vitest";
import { extractProductPage } from "../src/url";

describe("product page currency handling", () => {
  it("rejects non-JPY structured prices instead of treating them as yen", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Laptop Core i5-1235U 16GB RAM 512GB SSD",
      offers: { "@type": "Offer", price: "899", priceCurrency: "USD" },
    })}</script>`;

    const result = extractProductPage(html, "https://example.test/us-item");
    expect(result.priceJpy).toBeNull();
    expect(result.confidence.price).toBe(0);
  });

  it("continues to accept explicit JPY structured prices", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Laptop Core i5-1235U 16GB RAM 512GB SSD",
      offers: { "@type": "Offer", price: "89800", priceCurrency: "jpy" },
    })}</script>`;

    const result = extractProductPage(html, "https://example.test/jp-item");
    expect(result.priceJpy).toBe(89800);
    expect(result.confidence.price).toBe(96);
  });

  it("keeps currency-less structured prices for compatibility but does not upgrade the policy beyond existing behavior", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Laptop Core i5-1235U 16GB RAM 512GB SSD",
      offers: { "@type": "Offer", price: "59800" },
    })}</script>`;

    const result = extractProductPage(html, "https://example.test/legacy-item");
    expect(result.priceJpy).toBe(59800);
  });
});
