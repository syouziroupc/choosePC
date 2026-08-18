import app from "./browser-enhanced-entry";
import production from "./production-entry";
import { loadAdminOverview, recordApiRequest } from "./admin-store";
import { opsConsoleCss, opsConsoleHtml, opsConsoleJs } from "./ops-console";
import type { PersistenceEnv } from "./persistence";

interface Env extends PersistenceEnv {
  URL_INSPECT_LIMITER: RateLimit;
  MARKET_INGEST_TOKEN?: string;
  OFFER_INGEST_TOKEN?: string;
  COMMERCIAL_ADMIN_TOKEN?: string;
  CONVERSION_IMPORT_TOKEN?: string;
  BROWSER: BrowserRun;
}

type AppFetch = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
type ScheduledHandler = (controller: ScheduledController, env: Env, ctx: ExecutionContext) => Promise<void>;

const appFetch = app.fetch as unknown as AppFetch;
const scheduled = production.scheduled as unknown as ScheduledHandler;
const API_VERSION = "2026-08-18-static-frontend-v6";
const CLIENT_HEADER = "x-choosepc-client";
const SESSION_COOKIE = "pc_assist_sid";
const PUBLIC_API_PREFIX = "/api/v1/";
const ALLOWED_PRODUCTION_ORIGINS = new Set([
  "https://www.szpc.jp",
  "https://szpc.jp",
]);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function isPublicApi(pathname: string): boolean {
  return pathname.startsWith(PUBLIC_API_PREFIX);
}

function allowedOrigin(raw: string | null): string | null {
  if (!raw) return null;
  if (ALLOWED_PRODUCTION_ORIGINS.has(raw)) return raw;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return local && (url.protocol === "http:" || url.protocol === "https:") ? raw : null;
  } catch {
    return null;
  }
}

function normalizeClientId(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (/^[a-f0-9]{32}$/.test(value)) return value;
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) {
    return value.replace(/-/g, "");
  }
  return null;
}

function requestWithClientSession(request: Request): Request {
  const clientId = normalizeClientId(request.headers.get(CLIENT_HEADER));
  if (!clientId) return request;

  const headers = new Headers(request.headers);
  const cookies = (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.toLowerCase().startsWith(`${SESSION_COOKIE}=`));
  cookies.push(`${SESSION_COOKIE}=${clientId}`);
  headers.set("cookie", cookies.join("; "));
  return new Request(request, { headers });
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function authorized(request: Request, secret?: string): Promise<boolean> {
  if (!secret) return false;
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return false;
  const [actual, expected] = await Promise.all([digest(match[1]), digest(secret)]);
  let difference = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  return difference === 0;
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get("vary");
  const values = new Set((current ?? "").split(",").map((part) => part.trim()).filter(Boolean));
  values.add(value);
  headers.set("vary", [...values].join(", "));
}

function withApiHeaders(response: Response, origin: string | null, crossOrigin: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set("x-choosepc-api-version", API_VERSION);
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("x-content-type-options", "nosniff");
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-expose-headers", "Retry-After, X-ChoosePC-Api-Version");
    appendVary(headers, "Origin");
  }
  if (crossOrigin) headers.delete("set-cookie");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function preflight(request: Request, origin: string): Response {
  const requestedMethod = (request.headers.get("access-control-request-method") ?? "").toUpperCase();
  if (!new Set(["GET", "POST", "HEAD"]).has(requestedMethod)) {
    return new Response(null, { status: 405, headers: { allow: "GET, POST, HEAD, OPTIONS" } });
  }

  const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const allowedHeaders = new Set(["content-type", CLIENT_HEADER]);
  if (requestedHeaders.some((header) => !allowedHeaders.has(header))) {
    return new Response(null, { status: 400 });
  }

  const headers = new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, HEAD, OPTIONS",
    "access-control-allow-headers": "Content-Type, X-ChoosePC-Client",
    "access-control-max-age": "86400",
    "x-choosepc-api-version": API_VERSION,
    "x-robots-tag": "noindex, nofollow",
  });
  appendVary(headers, "Origin");
  return new Response(null, { status: 204, headers });
}

function metadata(request: Request, env: Env): Response {
  const url = new URL(request.url);
  return json({
    ok: true,
    service: "choosePC",
    mode: "api",
    apiVersion: API_VERSION,
    apiBase: `${url.origin}/api/v1`,
    frontendOrigins: [...ALLOWED_PRODUCTION_ORIGINS],
    clientHeader: "X-ChoosePC-Client",
    persistenceConfigured: Boolean(env.DB),
    publicUiHostedHere: false,
    operationsConsole: `${url.origin}/`,
  });
}

async function enrichHealth(response: Response, env: Env): Promise<Response> {
  if (!response.ok) return response;
  try {
    const payload = await response.clone().json() as Record<string, unknown>;
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({
      ...payload,
      mode: "api",
      apiVersion: API_VERSION,
      persistenceConfigured: Boolean(env.DB),
      publicUiHostedHere: false,
      operationsConsole: "/",
    }), { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

async function adminOverview(request: Request, env: Env): Promise<Response> {
  if (!await authorized(request, env.COMMERCIAL_ADMIN_TOKEN)) return json({ error: "NOT_AUTHORIZED" }, 401);
  if (!env.DB) return json({ error: "ADMIN_DB_UNAVAILABLE" }, 503);
  try {
    return json(await loadAdminOverview(env));
  } catch (error) {
    console.error(JSON.stringify({
      event: "admin_overview_error",
      error: error instanceof Error ? error.message : String(error),
    }));
    return json({ error: "ADMIN_OVERVIEW_UNAVAILABLE" }, 503);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const originHeader = request.headers.get("origin");
    const origin = allowedOrigin(originHeader);
    const publicApi = isPublicApi(url.pathname);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/ops" || url.pathname === "/ops/")) {
      return opsConsoleHtml();
    }
    if (request.method === "GET" && url.pathname === "/ops/app.css") return opsConsoleCss();
    if (request.method === "GET" && url.pathname === "/ops/app.js") return opsConsoleJs();

    if ((url.pathname === "/api" || url.pathname === "/api/v1") && request.method === "GET") {
      return withApiHeaders(metadata(request, env), origin, Boolean(originHeader));
    }

    if (url.pathname === "/api/internal/admin/overview" && request.method === "GET") {
      return adminOverview(request, env);
    }

    if (!publicApi) {
      if (url.pathname.startsWith("/api/internal/")) return appFetch(requestWithClientSession(request), env, ctx);
      return json({ error: "NOT_FOUND", service: "choosePC", mode: "api" }, 404);
    }

    if (originHeader && !origin) {
      return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
    }

    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 400 });
      return preflight(request, origin);
    }

    const forwarded = requestWithClientSession(request);
    let response = await appFetch(forwarded, env, ctx);
    if (url.pathname === "/api/v1/health" && request.method === "GET") {
      response = await enrichHealth(response, env);
    }
    const result = withApiHeaders(response, origin, Boolean(originHeader));
    ctx.waitUntil(recordApiRequest({
      env,
      pathname: url.pathname,
      method: request.method,
      status: result.status,
    }));
    return result;
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    return scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;
