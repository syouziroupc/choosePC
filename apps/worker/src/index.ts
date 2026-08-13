import {
  CPU_CATALOG,
  GPU_CATALOG,
  USE_CASES,
  assessSale,
  buildGamingProfile,
  decideReplacement,
  estimateMarket,
  evaluateAndRankCandidates,
  evaluatePc,
  extractProductPage,
  resolveHardware,
} from "../../../packages/core/src/index";
import type {
  EvaluationInput,
  MarketEstimate,
  MarketObservationInput,
  NormalizedPC,
  RecommendationCandidate,
  UseCaseProfile,
} from "../../../packages/core/src/index";
import {
  persistOutboundClick,
  resolveCommercialPresentations,
  resolveOutboundDestination,
} from "./commercial";
import {
  persistAnalytics,
  persistEvaluation,
  persistRecommendation,
  type PersistenceEnv,
} from "./persistence";

interface Env extends PersistenceEnv {
  URL_INSPECT_LIMITER: RateLimit;
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_REMOTE_HTML_BYTES = 700 * 1024;
const MAX_RECOMMENDATION_CANDIDATES = 20;
const MAX_MARKET_OBSERVATIONS = 200;
const SESSION_COOKIE = "pc_assist_sid";
const ALLOWED_REMOTE_DOMAINS = [
  "amazon.co.jp",
  "rakuten.co.jp",
  "shopping.yahoo.co.jp",
  "mercari.com",
  "lenovo.com",
  "dell.com",
  "hp.com",
  "dospara.co.jp",
  "pc-koubou.jp",
  "tsukumo.co.jp",
  "frontier-direct.jp",
  "sycom.co.jp",
];
const DEVICE_CATEGORIES = new Set([
  "general_laptop",
  "mobile_laptop",
  "gaming_laptop",
  "general_desktop",
  "gaming_desktop",
  "bto_desktop",
  "custom_desktop",
  "mini_pc",
  "workstation",
  "mac",
]);
const CONDITION_TYPES = new Set(["new", "used", "refurbished", "unknown"]);

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return new Response(JSON.stringify(data), { status, headers });
}

async function readJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  return JSON.parse(text) as T;
}

function parseCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function getSession(request: Request): { id: string; setCookie?: string } {
  const existing = parseCookie(request, SESSION_COOKIE);
  if (existing && /^[a-f0-9]{32}$/i.test(existing)) return { id: existing.toLowerCase() };
  const id = crypto.randomUUID().replace(/-/g, "");
  return {
    id,
    setCookie: `${SESSION_COOKIE}=${id}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`,
  };
}

function sessionHeaders(session: { setCookie?: string }): HeadersInit {
  return session.setCookie ? { "set-cookie": session.setCookie } : {};
}

function defer(ctx: ExecutionContext | undefined, task: Promise<unknown>): void {
  if (ctx) {
    ctx.waitUntil(task);
    return;
  }
  void task;
}

async function enforceUrlInspectionLimit(request: Request, env: Env): Promise<{ setCookie?: string }> {
  const session = getSession(request);
  const { success } = await env.URL_INSPECT_LIMITER.limit({ key: `url:${session.id}` });
  if (!success) throw new Error("RATE_LIMITED");
  return { setCookie: session.setCookie };
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
  if (!finiteOrNull(pc.condition.batteryHealthPct, 0, 100)) return false;
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
    finiteOrNull(market.lowPriceJpy, 1, 100_000_000) &&
    finiteOrNull(market.highPriceJpy, 1, 100_000_000) &&
    typeof market.sampleCount === "number" && Number.isInteger(market.sampleCount) && market.sampleCount >= 0 && market.sampleCount <= 1_000_000 &&
    typeof market.confidence === "number" && Number.isFinite(market.confidence) && market.confidence >= 0 && market.confidence <= 100 &&
    typeof market.ageDays === "number" && Number.isFinite(market.ageDays) && market.ageDays >= 0 && market.ageDays <= 36500 &&
    (market.source == null || market.source === "observed_market" || market.source === "user_estimate");
}

function validMarketObservations(value: unknown): value is MarketObservationInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MARKET_OBSERVATIONS) return false;
  const maxFutureMs = Date.now() + 86_400_000;
  for (const item of value) {
    if (!item || typeof item !== "object") return false;
    const observation = item as Partial<MarketObservationInput>;
    if (typeof observation.priceJpy !== "number" || !Number.isFinite(observation.priceJpy) || observation.priceJpy < 100 || observation.priceJpy > 100_000_000) return false;
    if (typeof observation.observedAt !== "string") return false;
    const observedAt = new Date(observation.observedAt).getTime();
    if (!Number.isFinite(observedAt) || observedAt > maxFutureMs) return false;
    if (typeof observation.similarity !== "number" || !Number.isFinite(observation.similarity) || observation.similarity < 0 || observation.similarity > 1) return false;
    if (typeof observation.sourceConfidence !== "number" || !Number.isFinite(observation.sourceConfidence) || observation.sourceConfidence < 0 || observation.sourceConfidence > 1) return false;
  }
  return true;
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

function validRecommendationCandidates(value: unknown): value is RecommendationCandidate[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RECOMMENDATION_CANDIDATES) return false;
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<RecommendationCandidate>;
    if (typeof candidate.candidateId !== "string" || !/^[a-zA-Z0-9._:-]{1,80}$/.test(candidate.candidateId) || ids.has(candidate.candidateId)) return false;
    ids.add(candidate.candidateId);
    if (!validPc(candidate.pc)) return false;
    if (candidate.market != null && !validMarket(candidate.market)) return false;
  }
  return true;
}

function outboundOfferId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/v1\/outbound\/([^/]{1,160})$/);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]);
    return /^[a-zA-Z0-9._:-]{1,80}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/v1/health") return json({ ok: true, service: "choosePC", engine: "0.2.0" });

      const outboundId = outboundOfferId(url.pathname);
      if (outboundId && request.method === "GET") {
        const session = getSession(request);
        const destination = await resolveOutboundDestination(env, outboundId);
        if (!destination) return json({ error: "OFFER_NOT_AVAILABLE" }, 404, sessionHeaders(session));
        defer(ctx, persistOutboundClick({ env, sessionId: session.id, destination }));
        const headers = new Headers(sessionHeaders(session));
        headers.set("location", destination.destinationUrl);
        headers.set("cache-control", "no-store");
        headers.set("referrer-policy", "strict-origin-when-cross-origin");
        headers.set("x-content-type-options", "nosniff");
        return new Response(null, { status: 302, headers });
      }

      if (url.pathname === "/api/v1/catalog" && request.method === "GET") {
        return json({
          cpus: CPU_CATALOG.map(({ capabilities: _capabilities, ...entry }) => entry),
          gpus: GPU_CATALOG.map(({ capabilities: _capabilities, ...entry }) => entry),
          useCases: Object.values(USE_CASES).map(({ requirements: _requirements, ...profile }) => profile),
        });
      }

      if (url.pathname === "/api/v1/url/inspect" && request.method === "POST") {
        const rate = await enforceUrlInspectionLimit(request, env);
        const body = await readJson<{ url?: string }>(request);
        if (!body.url) return json({ error: "URL_REQUIRED" }, 400, rate.setCookie ? { "set-cookie": rate.setCookie } : {});
        const { html, finalUrl } = await fetchLimitedHtml(body.url);
        return json(
          { extraction: extractProductPage(html, finalUrl) },
          200,
          rate.setCookie ? { "set-cookie": rate.setCookie } : {},
        );
      }

      if (url.pathname === "/api/v1/events" && request.method === "POST") {
        const session = getSession(request);
        const body = await readJson<{ event?: string; dimensions?: Record<string, string | number | boolean | null> }>(request);
        if (!body.event || !/^[a-z0-9_:-]{2,80}$/i.test(body.event)) return json({ error: "INVALID_EVENT" }, 400, sessionHeaders(session));
        console.log(JSON.stringify({ event: "analytics", name: body.event, dimensions: body.dimensions ?? {}, at: new Date().toISOString() }));
        defer(ctx, persistAnalytics({
          env,
          sessionId: session.id,
          eventName: body.event,
          dimensions: body.dimensions ?? {},
        }));
        return json({ ok: true }, 202, sessionHeaders(session));
      }

      if (url.pathname === "/api/v1/market/estimate" && request.method === "POST") {
        const session = getSession(request);
        const body = await readJson<{ observations?: unknown }>(request);
        if (!validMarketObservations(body.observations)) return json({ error: "INVALID_MARKET_OBSERVATIONS" }, 400, sessionHeaders(session));
        const market = estimateMarket(body.observations);
        defer(ctx, persistAnalytics({
          env,
          sessionId: session.id,
          eventName: "market_estimate_computed",
          dimensions: {
            submitted_samples: body.observations.length,
            accepted_samples: market.acceptedSamples,
            rejected_samples: market.rejectedSamples,
            confidence: market.estimate?.confidence ?? null,
          },
        }));
        return json({ market }, 200, sessionHeaders(session));
      }

      if (url.pathname === "/api/v1/sell" && request.method === "POST") {
        const session = getSession(request);
        const body = await readJson<{ pc?: unknown; market?: unknown }>(request);
        if (!validPc(body.pc)) return json({ error: "INVALID_PC" }, 400, sessionHeaders(session));
        if (body.market != null && !validMarket(body.market)) return json({ error: "INVALID_MARKET" }, 400, sessionHeaders(session));
        const sale = assessSale(body.pc, body.market ?? null);
        defer(ctx, persistAnalytics({
          env,
          sessionId: session.id,
          eventName: "sale_assessed",
          category: body.pc.category,
          dimensions: { route: sale.route, confidence: sale.confidence },
        }));
        return json({ sale }, 200, sessionHeaders(session));
      }

      if (url.pathname === "/api/v1/replace" && request.method === "POST") {
        const session = getSession(request);
        const body = await readJson<{ pc?: unknown; useCase?: string; gaming?: { resolution?: "1080p" | "1440p" | "4k"; targetFps?: 60 | 120 | 144 | 240 } }>(request);
        if (!validPc(body.pc)) return json({ error: "INVALID_PC" }, 400, sessionHeaders(session));
        const profile = resolveProfile(body);
        if (!profile) return json({ error: "INVALID_USE_CASE" }, 400, sessionHeaders(session));
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
        const evaluationId = await persistEvaluation({
          env,
          sessionId: session.id,
          inputType: "replacement_current",
          pc: body.pc,
          profile,
          result: currentEvaluation,
        });
        return json({
          evaluation: currentEvaluation,
          evaluationId,
          replacement: decideReplacement(body.pc, currentEvaluation),
          resolvedHardware: hardware,
        }, 200, sessionHeaders(session));
      }

      if (url.pathname === "/api/v1/evaluate" && request.method === "POST") {
        const session = getSession(request);
        const body = await readJson<{ pc?: unknown; useCase?: string; market?: unknown; gaming?: { resolution?: "1080p" | "1440p" | "4k"; targetFps?: 60 | 120 | 144 | 240 } }>(request);
        if (!validPc(body.pc)) return json({ error: "INVALID_PC" }, 400, sessionHeaders(session));
        if (body.market != null && !validMarket(body.market)) return json({ error: "INVALID_MARKET" }, 400, sessionHeaders(session));
        const profile = resolveProfile(body);
        if (!profile) return json({ error: "INVALID_USE_CASE" }, 400, sessionHeaders(session));
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
        const result = evaluatePc(input);
        const evaluationId = await persistEvaluation({
          env,
          sessionId: session.id,
          inputType: "purchase",
          pc: body.pc,
          profile,
          result,
        });
        return json({ result, evaluationId, resolvedHardware: hardware }, 200, sessionHeaders(session));
      }

      if (url.pathname === "/api/v1/recommend" && request.method === "POST") {
        const session = getSession(request);
        const body = await readJson<{ candidates?: unknown; useCase?: string; gaming?: { resolution?: "1080p" | "1440p" | "4k"; targetFps?: 60 | 120 | 144 | 240 } }>(request);
        if (!validRecommendationCandidates(body.candidates)) return json({ error: "INVALID_CANDIDATES" }, 400, sessionHeaders(session));
        const profile = resolveProfile(body);
        if (!profile) return json({ error: "INVALID_USE_CASE" }, 400, sessionHeaders(session));
        const ranked = evaluateAndRankCandidates({
          candidates: body.candidates,
          profile,
          engineVersion: "0.2.0",
          knowledgeVersion: "knowledge-2026-08-13.1",
        });
        const responseRanking = ranked.map((item, index) => ({
          rank: index + 1,
          candidateId: item.candidateId,
          result: item.result,
        }));
        const commercialOffers = await resolveCommercialPresentations({
          env,
          ranked: ranked.map((item, index) => ({
            offerId: item.candidateId,
            rank: index + 1,
            evaluationScore: item.result.scores.overall,
          })),
        });
        defer(ctx, persistRecommendation({
          env,
          sessionId: session.id,
          profile,
          ranked: ranked.map((item, index) => ({
            candidateId: item.candidateId,
            rank: index + 1,
            decision: item.result.decision,
            overall: item.result.scores.overall,
            fit: item.result.scores.fit,
            value: item.result.scores.value,
            confidence: item.result.scores.confidence,
          })),
          engineVersion: "0.2.0",
          knowledgeVersion: "knowledge-2026-08-13.1",
        }));
        return json({ ranked: responseRanking, commercialOffers }, 200, sessionHeaders(session));
      }

      return json({ error: "NOT_FOUND" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      if (message === "RATE_LIMITED") return json({ error: "RATE_LIMITED" }, 429, { "retry-after": "60" });
      const clientErrors = new Set([
        "REQUEST_TOO_LARGE",
        "HTTPS_REQUIRED",
        "CREDENTIALS_NOT_ALLOWED",
        "DOMAIN_NOT_SUPPORTED",
        "INVALID_REDIRECT",
        "REMOTE_NOT_HTML",
        "REMOTE_TOO_LARGE",
        "TOO_MANY_REDIRECTS",
      ]);
      if (clientErrors.has(message)) return json({ error: message }, 400);
      if (message.startsWith("REMOTE_HTTP_")) return json({ error: message }, 422);
      if (error instanceof SyntaxError) return json({ error: "INVALID_JSON" }, 400);
      console.error(JSON.stringify({ event: "request_error", path: url.pathname, error: message }));
      return json({ error: "INTERNAL_ERROR" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
