import baseWorker from "./index";
import {
  upsertCommercialConfiguration,
  type CommercialLinkInput,
  type CommercialProgramInput,
  type CommercialProgramStatus,
} from "./commercial-admin";
import {
  OFFER_MAX_AGE_MS,
  upsertTrustedMerchantOffer,
  type OfferStockState,
  type TrustedMerchantOffer,
} from "./offer-store";
import { loadOfferIngestionStatus } from "./offer-status";
import type { MerchantType, NormalizedPC } from "../../../packages/core/src/index";
import type { PersistenceEnv } from "./persistence";

interface Env extends PersistenceEnv {
  URL_INSPECT_LIMITER: RateLimit;
  MARKET_INGEST_TOKEN?: string;
  OFFER_INGEST_TOKEN?: string;
  COMMERCIAL_ADMIN_TOKEN?: string;
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
const MERCHANT_TYPES = new Set<MerchantType>(["own", "affiliate", "normal"]);
const PROGRAM_STATUSES = new Set<CommercialProgramStatus>(["active", "paused", "unknown"]);

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
    if (!Number.isFinite(expiresAt) || expiresAt < observedAt || expiresAt > observedAt + OFFER_MAX_AGE_MS) return false;
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

function validCommissionMetadata(value: unknown): value is Record<string, unknown> | null | undefined {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 4096;
  } catch {
    return false;
  }
}

function validProgram(value: unknown): value is CommercialProgramInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const program = value as Partial<CommercialProgramInput>;
  if (typeof program.key !== "string" || !/^[a-zA-Z0-9._:-]{1,80}$/.test(program.key)) return false;
  if (typeof program.merchant !== "string" || program.merchant.trim().length === 0 || program.merchant.length > 120) return false;
  if (!program.programType || !MERCHANT_TYPES.has(program.programType)) return false;
  if (!program.status || !PROGRAM_STATUSES.has(program.status)) return false;
  if (!validCommissionMetadata(program.commissionMetadata)) return false;
  if (program.disclosureText != null && (typeof program.disclosureText !== "string" || program.disclosureText.length > 1000)) return false;
  if (program.status === "active" && program.programType !== "normal" && (!program.disclosureText || program.disclosureText.trim().length === 0)) return false;
  if (program.sourceUrl != null && !validHttpsUrl(program.sourceUrl)) return false;
  if (program.lastVerifiedAt != null) {
    if (typeof program.lastVerifiedAt !== "string") return false;
    const verifiedAt = new Date(program.lastVerifiedAt).getTime();
    if (!Number.isFinite(verifiedAt) || verifiedAt > Date.now() + 86_400_000) return false;
  }
  if (program.clickRefParam != null && (typeof program.clickRefParam !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(program.clickRefParam.trim()))) return false;
  return true;
}

function validCommercialLink(value: unknown): value is CommercialLinkInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const link = value as Partial<CommercialLinkInput>;
  return typeof link.offerId === "string" && /^[a-zA-Z0-9._:-]{1,80}$/.test(link.offerId) && validHttpsUrl(link.destinationUrl);
}

function validCommercialPayload(body: { program?: unknown; links?: unknown }): body is { program: CommercialProgramInput; links?: CommercialLinkInput[] } {
  if (!validProgram(body.program)) return false;
  if (body.links == null) return true;
  if (!Array.isArray(body.links) || body.links.length > MAX_BATCH || !body.links.every(validCommercialLink)) return false;
  const offerIds = body.links.map((link) => link.offerId);
  return new Set(offerIds).size === offerIds.length;
}

async function handleOfferIngest(request: Request, env: Env): Promise<Response> {
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
  });
}

async function handleOfferStatus(request: Request, env: Env): Promise<Response> {
  if (!await authorized(request, env.OFFER_INGEST_TOKEN)) return json({ error: "NOT_FOUND" }, 404);
  const status = await loadOfferIngestionStatus(env);
  if (!status) return json({ error: "OFFER_DB_UNAVAILABLE" }, 503);
  return json({ status });
}

async function handleCommercialAdmin(request: Request, env: Env): Promise<Response> {
  if (!await authorized(request, env.COMMERCIAL_ADMIN_TOKEN)) return json({ error: "NOT_FOUND" }, 404);
  if (!env.DB) return json({ error: "COMMERCIAL_DB_UNAVAILABLE" }, 503);
  const body = await readJson<{ program?: unknown; links?: unknown }>(request);
  if (!validCommercialPayload(body)) return json({ error: "INVALID_COMMERCIAL_CONFIGURATION" }, 400);
  const stored = await upsertCommercialConfiguration({
    env,
    program: body.program,
    links: body.links ?? [],
  });
  return json({ stored });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isOfferIngest = url.pathname === "/api/internal/offers/upsert" && request.method === "POST";
    const isOfferStatus = url.pathname === "/api/internal/offers/status" && request.method === "GET";
    const isCommercialAdmin = url.pathname === "/api/internal/commercial/upsert" && request.method === "POST";
    if (!isOfferIngest && !isOfferStatus && !isCommercialAdmin) return baseWorker.fetch(request, env, ctx);

    try {
      if (isOfferIngest) return await handleOfferIngest(request, env);
      if (isOfferStatus) return await handleOfferStatus(request, env);
      return await handleCommercialAdmin(request, env);
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: "INVALID_JSON" }, 400);
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      if (message === "REQUEST_TOO_LARGE") return json({ error: message }, 400);
      if (message === "COMMERCIAL_OFFER_NOT_FOUND") return json({ error: message }, 404);
      if (message === "COMMERCIAL_MERCHANT_MISMATCH") return json({ error: message }, 409);
      if ([
        "INVALID_COMMERCIAL_URL",
        "INVALID_CLICK_REF_PARAM",
        "COMMISSION_METADATA_TOO_LARGE",
        "COMMERCIAL_DUPLICATE_OFFER_LINK",
        "INVALID_OFFER_URL",
        "INVALID_OFFER_OBSERVED_AT",
        "INVALID_OFFER_EXPIRY",
      ].includes(message)) return json({ error: message }, 400);
      console.error(JSON.stringify({
        event: "internal_admin_error",
        path: url.pathname,
        error: message,
      }));
      return json({ error: "INTERNAL_ERROR" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
