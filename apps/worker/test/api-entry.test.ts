import { describe, expect, it, vi } from "vitest";
import worker from "../src/api-entry";

type EnvShape = Parameters<typeof worker.fetch>[1];

function makeEnv() {
  const limit = vi.fn(async () => ({ success: true }));
  return {
    env: {
      BROWSER: { quickAction: vi.fn() },
      URL_INSPECT_LIMITER: { limit },
    } as unknown as EnvShape,
    limit,
  };
}

function makeAdminEnv() {
  const { env, limit } = makeEnv();
  const DB = {
    prepare(sql: string) {
      return {
        async first() {
          if (/FROM api_request_metrics/i.test(sql)) return { today: 2, last7Days: 5, last30Days: 8 };
          if (/outbound_clicks/i.test(sql)) {
            return { outbound30Days: 0, affiliateOutbound30Days: 0, conversions30Days: 0, commission30DaysJpy: 0 };
          }
          return null;
        },
        async all() { return { results: [] }; },
      };
    },
  };
  return {
    env: Object.assign(env as object, { DB, COMMERCIAL_ADMIN_TOKEN: "test-admin-secret" }) as EnvShape,
    limit,
  };
}

function context() {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

describe("API backend with workers.dev operations console", () => {
  it("serves the operations console at the worker root", async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(new Request("https://choosepc.example/"), env, context());
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(body).toContain("choosePC Operations");
    expect(body).toContain("API利用状況");
    expect(body).toContain("アフィリエイト・送客設定");
    expect(body).toContain("API動作検証");
    expect(body).toContain('id="admin-token" type="password"');
    expect(body).toContain('autocomplete="current-password"');
    expect(body).toContain('placeholder="COMMERCIAL_ADMIN_TOKEN"');
    expect(body).not.toMatch(/value=["'][^"']+['"][^>]*id=["']admin-token/i);
  });

  it("keeps API metadata at /api/v1 instead of the console", async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(new Request("https://choosepc.example/api/v1"), env, context());
    const body = await response.json() as { service?: string; mode?: string; publicUiHostedHere?: boolean; persistenceConfigured?: boolean; operationsConsole?: string };
    expect(response.status).toBe(200);
    expect(body.service).toBe("choosePC");
    expect(body.mode).toBe("api");
    expect(body.publicUiHostedHere).toBe(false);
    expect(body.persistenceConfigured).toBe(false);
    expect(body.operationsConsole).toBe("https://choosepc.example/");
  });

  it("does not expose admin overview without the commercial admin token", async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(new Request("https://choosepc.example/api/internal/admin/overview"), env, context());
    const body = await response.json() as { error?: string };
    expect(response.status).toBe(401);
    expect(body.error).toBe("NOT_AUTHORIZED");
  });

  it("returns the admin overview in the exact shape consumed by the operations console", async () => {
    const { env } = makeAdminEnv();
    const response = await worker.fetch(new Request("https://choosepc.example/api/internal/admin/overview", {
      headers: { authorization: "Bearer test-admin-secret" },
    }), env, context());
    const body = await response.json() as Record<string, unknown> & {
      requests?: { today?: number; last7Days?: number; last30Days?: number };
      commercial?: { programs?: unknown[] };
    };
    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("overview");
    expect(body.requests).toEqual(expect.objectContaining({ today: 2, last7Days: 5, last30Days: 8 }));
    expect(body.commercial?.programs).toEqual([]);
  });

  it("allows www.szpc.jp to read public API responses with exact-origin CORS", async () => {
    const { env } = makeEnv();
    const request = new Request("https://choosepc.example/api/v1/health", {
      headers: { origin: "https://www.szpc.jp" },
    });
    const response = await worker.fetch(request, env, context());
    const body = await response.json() as { mode?: string; persistenceConfigured?: boolean; publicUiHostedHere?: boolean };
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://www.szpc.jp");
    expect(response.headers.get("vary")).toContain("Origin");
    expect(response.headers.get("x-choosepc-api-version")).toBeTruthy();
    expect(body.mode).toBe("api");
    expect(body.persistenceConfigured).toBe(false);
    expect(body.publicUiHostedHere).toBe(false);
  });

  it("rejects browser API calls from unrelated origins", async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(new Request("https://choosepc.example/api/v1/catalog", {
      headers: { origin: "https://example.invalid" },
    }), env, context());
    const body = await response.json() as { error?: string };
    expect(response.status).toBe(403);
    expect(body.error).toBe("ORIGIN_NOT_ALLOWED");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers preflight only for the public frontend contract", async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(new Request("https://choosepc.example/api/v1/evaluate", {
      method: "OPTIONS",
      headers: {
        origin: "https://www.szpc.jp",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-choosepc-client",
      },
    }), env, context());
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://www.szpc.jp");
    expect(response.headers.get("access-control-allow-headers")).toContain("X-ChoosePC-Client");
  });

  it("maps the static frontend client id into the existing session/rate-limit path", async () => {
    const { env, limit } = makeEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      "<html><head><title>ThinkPad T14 Core i5-1135G7 16GB SSD 512GB 59,800円</title></head></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    ));
    try {
      const request = new Request("https://choosepc.example/api/v1/url/inspect", {
        method: "POST",
        headers: {
          origin: "https://www.szpc.jp",
          "content-type": "application/json",
          "x-choosepc-client": "123e4567-e89b-42d3-a456-426614174000",
        },
        body: JSON.stringify({ url: "https://amazon.co.jp/example" }),
      });
      const response = await worker.fetch(request, env, context());
      expect(response.status).toBe(200);
      expect(limit).toHaveBeenCalledWith({ key: "url:123e4567e89b42d3a456426614174000" });
      expect(response.headers.get("set-cookie")).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
