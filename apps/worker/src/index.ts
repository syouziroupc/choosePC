import { CPU_CATALOG, GPU_CATALOG, USE_CASES, assessSale, buildGamingProfile, decideReplacement, evaluatePc, extractProductPage, resolveHardware } from "../../../packages/core/src/index";
import type { EvaluationInput, MarketEstimate, NormalizedPC, UseCaseProfile } from "../../../packages/core/src/index";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_REMOTE_HTML_BYTES = 700 * 1024;
const ALLOWED_REMOTE_DOMAINS = ["amazon.co.jp", "rakuten.co.jp", "shopping.yahoo.co.jp", "mercari.com", "lenovo.com", "dell.com", "hp.com", "dospara.co.jp", "pc-koubou.jp", "tsukumo.co.jp", "frontier-direct.jp", "sycom.co.jp"];
const DEVICE_CATEGORIES = new Set(["general_laptop", "mobile_laptop", "gaming_laptop", "general_desktop", "gaming_desktop", "bto_desktop", "custom_desktop", "mini_pc", "workstation", "mac"]);
const CONDITION_TYPES = new Set(["new", "used", "refurbished", "unknown"]);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}

async function readJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  return JSON.parse(text) as T;
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return ALLOWED_REMOTE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function validateRemoteUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("CREDENTIALS_NOT_ALLOWED");
  if (!isAllowedHost(url.hostname)) throw new Error("DOMAIN_NOT_SUPPORTED");
  return url;
}

async function fetchLimitedHtml(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
  let url = validateRemoteUrl(rawUrl);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "PC-ASSIST/0.2 (+https://github.com/syouziroupc/choosePC)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("INVALID_REDIRECT");
      url = validateRemoteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`REMOTE_HTTP_${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) throw new Error("REMOTE_NOT_HTML");
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_REMOTE_HTML_BYTES) throw new Error("REMOTE_TOO_LARGE");
    if (!response.body) return { html: "", finalUrl: url.toString() };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let html = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_REMOTE_HTML_BYTES) throw new Error("REMOTE_TOO_LARGE");
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return { html, finalUrl: url.toString() };
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

function finiteOrNull(value: unknown, min: number, max: number): boolean {
  return value == null || (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max);
}

function validPc(value: unknown): value is NormalizedPC {
  if (!value || typeof value !== "object") return false;
  const pc = value as Partial<NormalizedPC>;
  if (!pc.category || !DEVICE_CATEGORIES.has(pc.category)) return false;
  if (!pc.condition || !CONDITION_TYPES.has(pc.condition.type)) return false;
  if (!pc.commerce || !finiteOrNull(pc.commerce.priceJpy, 0, 100_000_000) || !finiteOrNull(pc.commerce.warrantyDays, 0, 3650)) return false;
  if (pc.memory && !finiteOrNull(pc.memory.sizeGb, 1, 4096)) return false;
  if (pc.gpu && (!finiteOrNull(pc.gpu.tgpW, 1, 1000) || !finiteOrNull(pc.gpu.vramGb, 0, 512))) return false;
  if (pc.condition && !finiteOrNull(pc.condition.batteryHealthPct, 0, 100)) return false;
  if (pc.mobility && !finiteOrNull(pc.mobility.weightKg, 0.1, 100)) return false;
  if (pc.display && !finiteOrNull(pc.display.refreshHz, 1, 1000)) return false;
  if (pc.storage?.some((item) => !finiteOrNull(item.sizeGb, 1, 1_000_000))) return false;
  return true;
}

function validMarket(value: unknown): value is MarketEstimate {
  if (!value || typeof value !== "object") return false;
  const market = value as Partial<MarketEstimate>;
  return finiteOrNull(market.fairPriceJpy, 1, 100_000_000) &&
    typeof market.fairPriceJpy === "number" &&
    typeof market.sampleCount === "number" && market.sampleCount >= 0 && market.sampleCount <= 1_000_000 &&
    typeof market.confidence === "number" && market.confidence >= 0 && market.confidence <= 100 &&
    typeof market.ageDays === "number" && market.ageDays >= 0 && market.ageDays <= 36500 &&
    (market.source == null || market.source === "observed_market" || market.source === "user_estimate");
}

function resolveProfile(body: { useCase?: string; gaming?: { resolution?: "1080p" | "1440p" | "4k"; targetFps?: 60 | 120 | 144 | 240 } }): UseCaseProfile | null {
  if (body.useCase === "gaming") return buildGamingProfile(body.gaming?.resolution ?? "1080p", body.gaming?.targetFps ?? 60);
  return body.useCase && USE_CASES[body.useCase] ? USE_CASES[body.useCase] : null;
}

function resolvePcHardware(pc: NormalizedPC) {
  return resolveHardware(pc.cpu?.raw, pc.gpu?.raw, pc.gpu?.tgpW, {
    cpuConfidence: pc.cpu?.confidence,
    gpuConfidence: pc.gpu?.confidence,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/v1/health") return json({ ok: true, service: "choosePC", engine: "0.2.0" });

      if (url.pathname === "/api/v1/catalog" && request.method === "GET") {
        return json({
          cpus: CPU_CATALOG.map(({ capabilities: _capabilities, ...entry }) => entry),
          gpus: GPU_CATALOG.map(({ capabilities: _capabilities, ...entry }) => entry),
          useCases: Object.values(USE_CASES).map(({ requirements: _requirements, ...profile }) => profile),
        });
      }

      if (url.pathname === "/api/v1/url/inspect" && request.method === "POST") {
        const body = await readJson<{ url?: string }>(request);
        if (!body.url) return json({ error: "URL_REQUIRED" }, 400);
        const { html, finalUrl } = await fetchLimitedHtml(body.url);
        return json({ extraction: extractProductPage(html, finalUrl) });
      }

      if (url.pathname === "/api/v1/events" && request.method === "POST") {
        const body = await readJson<{ event?: string; dimensions?: Record<string, string | number | boolean | null> }>(request);
        if (!body.event || !/^[a-z0-9_:-]{2,80}$/i.test(body.event)) return json({ error: "INVALID_EVENT" }, 400);
        console.log(JSON.stringify({ event: "analytics", name: body.event, dimensions: body.dimensions ?? {}, at: new Date().toISOString() }));
        return json({ ok: true }, 202);
      }

      if (url.pathname === "/api/v1/sell" && request.method === "POST") {
        const body = await readJson<{ pc?: unknown; market?: unknown }>(request);
        if (!validPc(body.pc)) return json({ error: "INVALID_PC" }, 400);
        if (body.market != null && !validMarket(body.market)) return json({ error: "INVALID_MARKET" }, 400);
        return json({ sale: assessSale(body.pc, body.market ?? null) });
      }

      if (url.pathname === "/api/v1/replace" && request.method === "POST") {
        const body = await readJson<{ pc?: unknown; useCase?: string; gaming?: { resolution?: "1080p" | "1440p" | "4k"; targetFps?: 60 | 120 | 144 | 240 } }>(request);
        if (!validPc(body.pc)) return json({ error: "INVALID_PC" }, 400);
        const profile = resolveProfile(body);
        if (!profile) return json({ error: "INVALID_USE_CASE" }, 400);
        const hardware = resolvePcHardware(body.pc);
        const currentEvaluation = evaluatePc({
          pc: body.pc,
          profile,
          hardware,
          market: null,
          context: "ownership",
          engineVersion: "0.2.0",
          knowledgeVersion: "knowledge-2026-08-13.1",
        });
        return json({ evaluation: currentEvaluation, replacement: decideReplacement(body.pc, currentEvaluation), resolvedHardware: hardware });
      }

      if (url.pathname === "/api/v1/evaluate" && request.method === "POST") {
        const body = await readJson<{ pc?: unknown; useCase?: string; market?: unknown; gaming?: { resolution?: "1080p" | "1440p" | "4k"; targetFps?: 60 | 120 | 144 | 240 } }>(request);
        if (!validPc(body.pc)) return json({ error: "INVALID_PC" }, 400);
        if (body.market != null && !validMarket(body.market)) return json({ error: "INVALID_MARKET" }, 400);
        const profile = resolveProfile(body);
        if (!profile) return json({ error: "INVALID_USE_CASE" }, 400);
        const hardware = resolvePcHardware(body.pc);
        const input: EvaluationInput = {
          pc: body.pc,
          profile,
          hardware,
          market: body.market ?? null,
          engineVersion: "0.2.0",
          knowledgeVersion: "knowledge-2026-08-13.1",
          context: "purchase",
        };
        return json({ result: evaluatePc(input), resolvedHardware: hardware });
      }

      return json({ error: "NOT_FOUND" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      const clientErrors = new Set(["REQUEST_TOO_LARGE", "HTTPS_REQUIRED", "CREDENTIALS_NOT_ALLOWED", "DOMAIN_NOT_SUPPORTED", "INVALID_REDIRECT", "REMOTE_NOT_HTML", "REMOTE_TOO_LARGE", "TOO_MANY_REDIRECTS"]);
      if (clientErrors.has(message)) return json({ error: message }, 400);
      if (message.startsWith("REMOTE_HTTP_")) return json({ error: message }, 422);
      if (error instanceof SyntaxError) return json({ error: "INVALID_JSON" }, 400);
      console.error(JSON.stringify({ event: "request_error", path: url.pathname, error: message }));
      return json({ error: "INTERNAL_ERROR" }, 500);
    }
  },
} satisfies ExportedHandler;
