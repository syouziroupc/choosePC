import baseWorker from "./index";
import {
  upsertTrustedMerchantOffer,
  type OfferStockState,
  type TrustedMerchantOffer,
} from "./offer-store";
import type { NormalizedPC } from "../../../packages/core/src/index";
import type { PersistenceEnv } from "./persistence";

interface Env extends PersistenceEnv {
  URL_INSPECT_LIMITER: RateLimit;
  MARKET_INGEST_TOKEN?: string;
  OFFER_INGEST_TOKEN?: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_BATCH = 25;
const FORBIDDEN_COMMERCIAL_FIELDS = new Set([
  "affiliateUrl",
  "affiliate_url",
  "commission",
  "commissionRate",
  "commission_rate",
  "commercialProgram",
  "commercial_program",
  "programId",
  "program_id",
  "destinationUrl",
  "destination_url",
]);
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
const STOCK_STATES = new Set<OfferStockState>([
  "in_stock",
  "low_stock",
  "out_of_stock",
  "sold",
  "unavailable",
  "unknown",
]);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

async function readJson<T>(request: Request): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
  return JSON.parse(text) as T;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function constantTimeTokenMatch(actual: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function authorized(request: Request, secret?: string): Promise<boolean> {
  if (!secret) return false;
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return Boolean(match?.[1]) && await constantTimeTokenMatch(match![1], secret);
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

function validHttpsUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length < 8 || raw.length > 2048) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validOffer(value: unknown): value is TrustedMerchantOffer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  if ([...FORBIDDEN_COMMERCIAL_FIELDS].some((field) => Object.prototype.hasOwnProperty.call(raw, field))) return false;
  const offer = value as Partial<TrustedMerchantOffer>;
  if (typeof offer.merchant !== "string" || offer.merchant.trim().length === 0 || offer.merchant.length > 120) return false;
  if (typeof offer.title !== "string" || offer.title.trim().length === 0 || offer.title.length > 500) return false;
  if (typeof offer.priceJpy !== "number" || !Number.isFinite(offer.priceJpy) || offer.priceJpy < 100 || offer.priceJpy > 100_000_000) return false;
  if (!validHttpsUrl(offer.productUrl)) return false;
  if (!offer.stockState || !STOCK_STATES.has(offer.stockState)) return false;
  if (!validPc(offer.pc)) return false;
  if (typeof offer.observedAt !== "string") return false;
  const observedAt = new Date(offer.observedAt).getTime();
  if (!Number.isFinite(observedAt) || observedAt > Date.now() + 86_400_000) return false;
  if (offer.expiresAt != null) {
    if (typeof offer.expiresAt !== "string") return false;
    const expiresAt = new Date(offer.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt < observedAt || expiresAt > observedAt + 366 * 86_400_000) return false;
  }
  return true;
}

function offerBatch(body: { offer?: unknown; offers?: unknown }): TrustedMerchantOffer[] | null {
  if (body.offer != null && body.offers != null) return null;
  const values = body.offers != null ? body.offers : body.offer != null ? [body.offer] : null;
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_BATCH) return null;
  if (!values.every(validOffer)) return null;
  return values;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/api/internal/offers/upsert" || request.method !== "POST") {
      return baseWorker.fetch(request, env, ctx);
    }

    try {
      if (!await authorized(request, env.OFFER_INGEST_TOKEN)) return json({ error: "NOT_FOUND" }, 404);
      if (!env.DB) return json({ error: "OFFER_DB_UNAVAILABLE" }, 503);
      const body = await readJson<{ offer?: unknown; offers?: unknown }>(request);
      const offers = offerBatch(body);
      if (!offers) return json({ error: "INVALID_OFFERS" }, 400);

      const stored = [];
      for (const offer of offers) stored.push(await upsertTrustedMerchantOffer({ env, offer }));
      return json({
        stored,
        createdCount: stored.filter((item) => item.created).length,
        updatedCount: stored.filter((item) => !item.created).length,
      }, 200);
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: "INVALID_JSON" }, 400);
      if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") return json({ error: "REQUEST_TOO_LARGE" }, 400);
      console.error(JSON.stringify({
        event: "offer_ingest_error",
        error: error instanceof Error ? error.message : String(error),
      }));
      return json({ error: "INTERNAL_ERROR" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
