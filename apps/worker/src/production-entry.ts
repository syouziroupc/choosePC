import app from "./entry";
import {
  attachClickReference,
  persistOutboundClick,
  resolveOutboundDestination,
} from "./commercial";
import {
  upsertConversion,
  type ConversionInput,
  type ConversionStatus,
} from "./conversion-store";
import type { PersistenceEnv } from "./persistence";
import { loadRevenueMetrics } from "./revenue-metrics";

interface Env extends PersistenceEnv {
  URL_INSPECT_LIMITER: RateLimit;
  MARKET_INGEST_TOKEN?: string;
  OFFER_INGEST_TOKEN?: string;
  COMMERCIAL_ADMIN_TOKEN?: string;
  CONVERSION_IMPORT_TOKEN?: string;
}

const SESSION_COOKIE = "pc_assist_sid";
const MAX_BODY_BYTES = 64 * 1024;
const CONVERSION_STATUSES = new Set<ConversionStatus>([
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "refunded",
]);

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return new Response(JSON.stringify(data), { status, headers });
}

function parseCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
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

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function constantTimeTokenMatch(actual: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

async function authorized(request: Request, secret?: string): Promise<boolean> {
  if (!secret) return false;
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return Boolean(match?.[1]) && await constantTimeTokenMatch(match![1], secret);
}

async function readJson<T>(request: Request): Promise<T> {
  const declaredHeader = request.headers.get("content-length");
  if (declaredHeader) {
    const declared = Number(declaredHeader);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  }
  if (!request.body) throw new SyntaxError("empty body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("REQUEST_TOO_LARGE");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function finiteNumber(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validMetadata(value: unknown): value is Record<string, unknown> | null | undefined {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 8192;
  } catch {
    return false;
  }
}

function validConversion(value: unknown): value is ConversionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const conversion = value as Partial<ConversionInput>;
  if (typeof conversion.provider !== "string" || conversion.provider.trim().length === 0 || conversion.provider.length > 80) return false;
  if (typeof conversion.externalReference !== "string" || conversion.externalReference.trim().length === 0 || conversion.externalReference.length > 240) return false;
  if (conversion.outboundClickId != null && (
    typeof conversion.outboundClickId !== "string"
    || !/^[a-zA-Z0-9._:-]{1,80}$/.test(conversion.outboundClickId)
  )) return false;
  if (typeof conversion.occurredAt !== "string") return false;
  const occurredAt = new Date(conversion.occurredAt).getTime();
  if (!Number.isFinite(occurredAt) || occurredAt > Date.now() + 86_400_000) return false;
  if (conversion.orderValueJpy != null && !finiteNumber(conversion.orderValueJpy, 0, 1_000_000_000)) return false;
  if (conversion.commissionJpy != null && !finiteNumber(conversion.commissionJpy, -100_000_000, 100_000_000)) return false;
  if (!conversion.status || !CONVERSION_STATUSES.has(conversion.status)) return false;
  return validMetadata(conversion.metadata);
}

async function handleOutbound(request: Request, env: Env, offerId: string): Promise<Response> {
  const session = getSession(request);
  const destination = await resolveOutboundDestination(env, offerId);
  if (!destination) return json({ error: "OFFER_NOT_AVAILABLE" }, 404, sessionHeaders(session));

  const clickId = crypto.randomUUID();
  const persisted = await persistOutboundClick({
    env,
    clickId,
    sessionId: session.id,
    destination,
  });
  const redirectUrl = persisted
    ? attachClickReference(destination.destinationUrl, destination.clickRefParam, persisted)
    : destination.destinationUrl;

  const headers = new Headers(sessionHeaders(session));
  headers.set("location", redirectUrl);
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-content-type-options", "nosniff");
  return new Response(null, { status: 302, headers });
}

async function handleConversionImport(request: Request, env: Env): Promise<Response> {
  if (!await authorized(request, env.CONVERSION_IMPORT_TOKEN)) return json({ error: "NOT_FOUND" }, 404);
  if (!env.DB) return json({ error: "CONVERSION_DB_UNAVAILABLE" }, 503);

  const body = await readJson<{ conversion?: unknown }>(request);
  if (!validConversion(body.conversion)) return json({ error: "INVALID_CONVERSION" }, 400);
  const stored = await upsertConversion({ env, conversion: body.conversion });
  return json({ stored });
}

async function handleRevenueMetrics(request: Request, env: Env, url: URL): Promise<Response> {
  if (!await authorized(request, env.COMMERCIAL_ADMIN_TOKEN)) return json({ error: "NOT_FOUND" }, 404);

  const rawDays = url.searchParams.get("days");
  if (rawDays != null && !/^\d{1,3}$/.test(rawDays)) return json({ error: "INVALID_WINDOW" }, 400);
  const days = rawDays == null ? 30 : Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) return json({ error: "INVALID_WINDOW" }, 400);
  if (!env.DB) return json({ error: "REVENUE_DB_UNAVAILABLE" }, 503);

  const metrics = await loadRevenueMetrics(env, days);
  if (!metrics) return json({ error: "REVENUE_DB_UNAVAILABLE" }, 503);
  return json({ metrics });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const offerId = request.method === "GET" ? outboundOfferId(url.pathname) : null;
    if (offerId) return handleOutbound(request, env, offerId);

    const isConversionImport = url.pathname === "/api/internal/conversions/upsert" && request.method === "POST";
    const isRevenueMetrics = url.pathname === "/api/internal/metrics/revenue" && request.method === "GET";
    if (!isConversionImport && !isRevenueMetrics) return app.fetch(request, env, ctx);

    try {
      if (isConversionImport) return await handleConversionImport(request, env);
      return await handleRevenueMetrics(request, env, url);
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: "INVALID_JSON" }, 400);
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      if (message === "REQUEST_TOO_LARGE" || message === "CONVERSION_METADATA_TOO_LARGE") {
        return json({ error: message }, 400);
      }
      if (message === "CONVERSION_CLICK_NOT_FOUND") return json({ error: message }, 404);
      if (message === "CONVERSION_DB_UNAVAILABLE") return json({ error: message }, 503);
      console.error(JSON.stringify({
        event: "production_route_error",
        path: url.pathname,
        error: message,
      }));
      return json({ error: "INTERNAL_ERROR" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
