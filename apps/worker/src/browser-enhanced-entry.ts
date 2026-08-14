import worker from "./production-entry";
import { extractProductPage } from "../../../packages/core/src/index";
import type { PersistenceEnv } from "./persistence";

interface Env extends PersistenceEnv {
  URL_INSPECT_LIMITER: RateLimit;
  MARKET_INGEST_TOKEN?: string;
  OFFER_INGEST_TOKEN?: string;
  COMMERCIAL_ADMIN_TOKEN?: string;
  CONVERSION_IMPORT_TOKEN?: string;
  BROWSER: BrowserRun;
}

type Extraction = ReturnType<typeof extractProductPage>;
type InspectEnvelope = { extraction?: Extraction; error?: string };
type BaseFetch = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

const baseFetch = worker.fetch as unknown as BaseFetch;
export const UI_REVISION = "2026-08-14-ai-smell-v2";

function extractionCoverage(extraction: Extraction): number {
  const fields: unknown[] = [
    extraction.title,
    extraction.priceJpy,
    extraction.cpuRaw,
    extraction.gpuRaw,
    extraction.ramGb,
    extraction.storageGb,
  ];
  return fields.reduce<number>((count, value) => count + (value != null && value !== "" ? 1 : 0), 0);
}

function shouldRenderFallback(extraction: Extraction): boolean {
  return !(extractionCoverage(extraction) >= 4 && Boolean(extraction.cpuRaw) && extraction.priceJpy != null);
}

async function renderedExtraction(env: Env, sourceUrl: string): Promise<Extraction | null> {
  try {
    const response = await env.BROWSER.quickAction("content", {
      url: sourceUrl,
      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: 15000,
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { success: boolean; result?: string };
    if (!data.success || typeof data.result !== "string") return null;
    return extractProductPage(data.result, sourceUrl);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "browser_run_fallback_failed",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    }));
    return null;
  }
}

function responseWithBaseHeaders(base: Response, body: unknown): Response {
  const headers = new Headers(base.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status: base.status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/v1/health" && request.method === "GET") {
      const response = await baseFetch(request, env, ctx);
      if (!response.ok) return response;
      try {
        const payload = await response.clone().json() as Record<string, unknown>;
        return responseWithBaseHeaders(response, { ...payload, uiRevision: UI_REVISION });
      } catch {
        return response;
      }
    }

    if (url.pathname !== "/api/v1/url/inspect" || request.method !== "POST") {
      return baseFetch(request, env, ctx);
    }

    const forwarded = request.clone() as unknown as Request;
    const baseResponse = await baseFetch(forwarded, env, ctx);
    if (!baseResponse.ok) return baseResponse;

    let basePayload: InspectEnvelope;
    try {
      basePayload = await baseResponse.clone().json() as InspectEnvelope;
    } catch {
      return baseResponse;
    }
    if (!basePayload.extraction || !shouldRenderFallback(basePayload.extraction)) return baseResponse;

    let sourceUrl: string | null = null;
    try {
      const body = await request.json() as { url?: unknown };
      sourceUrl = typeof body.url === "string" ? body.url : null;
    } catch {
      return baseResponse;
    }
    if (!sourceUrl) return baseResponse;

    const rendered = await renderedExtraction(env, sourceUrl);
    if (!rendered) return baseResponse;
    if (extractionCoverage(rendered) <= extractionCoverage(basePayload.extraction)) return baseResponse;

    console.log(JSON.stringify({
      event: "browser_run_fallback_used",
      source: new URL(sourceUrl).hostname,
      baseCoverage: extractionCoverage(basePayload.extraction),
      renderedCoverage: extractionCoverage(rendered),
    }));
    return responseWithBaseHeaders(baseResponse, { extraction: rendered, fallback: "browser_run_content" });
  },
} satisfies ExportedHandler<Env>;
