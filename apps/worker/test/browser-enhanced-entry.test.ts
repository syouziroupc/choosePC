import { describe, expect, it, vi } from "vitest";
import worker from "../src/browser-enhanced-entry";

type BrowserMock = {
  quickAction: ReturnType<typeof vi.fn>;
};

function env(browser: BrowserMock) {
  return {
    BROWSER: browser,
    URL_INSPECT_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  } as unknown as Parameters<typeof worker.fetch>[1];
}

function context() {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

describe("browser-enhanced URL inspection", () => {
  it("does not invoke Browser Run when the deterministic parser already has enough fields", async () => {
    const browser: BrowserMock = { quickAction: vi.fn() };
    const html = `<html><head><title>ThinkPad T14 Core i5-1135G7 16GB 512GB 59,800円</title></head><body>Core i5-1135G7 16GB SSD 512GB 59,800円</body></html>`;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(html, { status: 200, headers: { "content-type": "text/html" } }));
    try {
      const request = new Request("https://choosepc.example/api/v1/url/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://amazon.co.jp/example" }),
      });
      const response = await worker.fetch(request, env(browser), context());
      expect(response.status).toBe(200);
      expect(browser.quickAction).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses rendered HTML only when it improves sparse extraction", async () => {
    const browser: BrowserMock = {
      quickAction: vi.fn(async () => new Response(JSON.stringify({
        success: true,
        result: `<html><head><title>ThinkPad T14 Core i5-1135G7 16GB SSD 512GB 59,800円</title></head><body>Core i5-1135G7 16GB SSD 512GB 59,800円</body></html>`,
      }), { status: 200, headers: { "content-type": "application/json" } })),
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html><body>商品ページ</body></html>", { status: 200, headers: { "content-type": "text/html" } }));
    try {
      const request = new Request("https://choosepc.example/api/v1/url/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://amazon.co.jp/example" }),
      });
      const response = await worker.fetch(request, env(browser), context());
      const body = await response.json() as { extraction: { cpuRaw: string | null; priceJpy: number | null }; fallback?: string };
      expect(response.status).toBe(200);
      expect(browser.quickAction).toHaveBeenCalledOnce();
      expect(body.fallback).toBe("browser_run_content");
      expect(body.extraction.cpuRaw).toContain("i5-1135G7");
      expect(body.extraction.priceJpy).toBe(59800);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
