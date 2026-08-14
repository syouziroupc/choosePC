import { describe, expect, it } from "vitest";
import { extractMerchantPageHints, extractProductPage } from "../src/index";

describe("merchant-specific URL parsing", () => {
  it("extracts Amazon Japan product scope without recommendation contamination", () => {
    const html = `<!doctype html><html><head><title>Example Laptop</title></head><body>
      <div id="productTitle">Office Laptop Intel Core i5-1235U</div>
      <div class="a-price-whole">79,800円</div>
      <div id="productOverview_feature_div">
        CPU Intel Core i5-1235U / メモリ 16GB / SSD 512GB / Intel Iris Xe Graphics
      </div>
      <aside>おすすめ: Ryzen 7 7800X3D RTX 4060 32GB RAM SSD 1TB</aside>
      <button>カートに入れる</button>
    </body></html>`;

    const hints = extractMerchantPageHints(html, "https://www.amazon.co.jp/dp/example");
    expect(hints.merchant).toBe("Amazon.co.jp");
    expect(hints.parserName).toBe("amazon-jp");
    expect(hints.priceJpy).toBe(79800);
    expect(hints.specText).toContain("i5-1235U");
    expect(hints.stockState).toBe("in_stock");

    const result = extractProductPage(html, "https://www.amazon.co.jp/dp/example");
    expect(result.cpuRaw).toBe("Intel Core i5-1235U");
    expect(result.gpuRaw).toBe("Intel Iris Xe Graphics");
    expect(result.ramGb).toBe(16);
    expect(result.storageGb).toBe(512);
    expect(result.priceJpy).toBe(79800);
    expect(result.parserName).toBe("amazon-jp");
  });

  it("parses Japanese BTO labeled specification blocks", () => {
    const html = `<!doctype html><html><body>
      <h1 class="product-name">GALLERIA Example</h1>
      <div class="product-price">189,800円</div>
      <table class="spec-table"><tr><th>CPU</th><td>Intel Core i5-12400F</td></tr>
        <tr><th>グラフィックス</th><td>GeForce RTX 4060</td></tr>
        <tr><th>メモリ</th><td>16GB</td></tr><tr><th>SSD</th><td>1TB</td></tr></table>
      <div>在庫あり</div>
    </body></html>`;

    const result = extractProductPage(html, "https://www.dospara.co.jp/TC30/example.html");
    expect(result.merchant).toBe("ドスパラ");
    expect(result.cpuRaw).toBe("Intel Core i5-12400F");
    expect(result.gpuRaw).toBe("GeForce RTX 4060");
    expect(result.ramGb).toBe(16);
    expect(result.storageGb).toBe(1024);
    expect(result.priceJpy).toBe(189800);
    expect(result.stockState).toBe("in_stock");
  });

  it("recognizes explicit sold-out state", () => {
    const html = `<html><body><h1 class="product-name">Example PC</h1><div class="price">59,800円</div><div>売り切れ</div></body></html>`;
    const hints = extractMerchantPageHints(html, "https://www.pc-koubou.jp/products/detail.php?product_id=1");
    expect(hints.merchant).toBe("パソコン工房");
    expect(hints.stockState).toBe("sold");
    expect(hints.confidence.stock).toBeGreaterThan(80);
  });

  it("does not scan the whole page for components when multiple Product objects exist and no merchant scope is available", () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Main PC">
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "Main PC",
        url: "https://example.test/main",
        offers: { "@type": "Offer", price: "49800", priceCurrency: "JPY" },
      })}</script>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "Recommended Ryzen 7 7800X3D RTX 4060",
        url: "https://example.test/recommendation",
        offers: { "@type": "Offer", price: "199800", priceCurrency: "JPY" },
      })}</script>
    </head><body><aside>Ryzen 7 7800X3D / GeForce RTX 4060 / 32GB RAM / SSD 1TB</aside></body></html>`;

    const result = extractProductPage(html, "https://example.test/main");
    expect(result.priceJpy).toBe(49800);
    expect(result.cpuRaw).toBeNull();
    expect(result.gpuRaw).toBeNull();
    expect(result.ramGb).toBeNull();
    expect(result.storageGb).toBeNull();
  });

  it("keeps unsupported hosts on the generic parser", () => {
    const hints = extractMerchantPageHints("<html></html>", "https://example.test/item");
    expect(hints.merchant).toBeNull();
    expect(hints.parserName).toBe("generic");
    expect(hints.stockState).toBe("unknown");
  });
});
