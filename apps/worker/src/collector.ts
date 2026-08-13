import {
  extractProductPage,
  merchantNameForUrl,
  type DeviceCategory,
  type NormalizedPC,
  type ProductPageExtraction,
} from "../../../packages/core/src/index";
import { persistTrustedMarketObservation, type TrustedMarketSource } from "./market-store";
import { upsertTrustedMerchantOffer } from "./offer-store";
import type { PersistenceEnv } from "./persistence";

export type CollectorMode = "offer" | "market" | "both";
export type CollectorCondition = "new" | "used" | "refurbished" | "unknown";

export interface CollectorSourceInput {
  productUrl: string;
  mode: CollectorMode;
  category: DeviceCategory;
  conditionType: CollectorCondition;
  warrantyDays?: number | null;
  refreshMinutes?: number;
  enabled?: boolean;
}

export interface CollectorSourceRecord {
  id: string;
  merchant: string;
  productUrl: string;
  mode: CollectorMode;
  category: DeviceCategory;
  conditionType: CollectorCondition;
  warrantyDays: number | null;
  enabled: boolean;
  refreshMinutes: number;
  nextRunAt: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string;
  failureCount: number;
  lastError: string | null;
  parserName: string | null;
  parserVersion: string | null;
}

export interface CollectorBatchResult {
  attempted: number;
  success: number;
  partial: number;
  failed: number;
  skipped: number;
}

type CollectorSourceRow = {
  id: string;
  merchant: string;
  product_url: string;
  mode: CollectorMode;
  category: DeviceCategory;
  condition_type: CollectorCondition;
  warranty_days: number | null;
  enabled: number;
  refresh_minutes: number;
  next_run_at: string;
  last_run_at: string | null;
  last_success_at: string | null;
  last_status: string;
  failure_count: number;
  last_error: string | null;
  parser_name: string | null;
  parser_version: string | null;
};

type RunOutcome = "success" | "partial" | "failed" | "skipped";

const MAX_REMOTE_HTML_BYTES = 700 * 1024;
const MAX_REDIRECTS = 4;
const DEFAULT_BATCH = 8;
const MAX_BATCH = 20;
const DEVICE_CATEGORIES = new Set<DeviceCategory>([
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
const CONDITION_TYPES = new Set<CollectorCondition>(["new", "used", "refurbished", "unknown"]);
const MODES = new Set<CollectorMode>(["offer", "market", "both"]);

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeCollectorUrl(raw: string, expectedMerchant?: string): { url: URL; merchant: string } {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("COLLECTOR_URL_INVALID");
  const merchant = merchantNameForUrl(url.toString());
  if (!merchant) throw new Error("COLLECTOR_DOMAIN_NOT_SUPPORTED");
  if (expectedMerchant && merchant !== expectedMerchant) throw new Error("COLLECTOR_REDIRECT_MERCHANT_CHANGED");
  url.hash = "";
  return { url, merchant };
}

async function fetchLimitedHtml(rawUrl: string, expectedMerchant: string): Promise<{ html: string; finalUrl: string }> {
  let current = normalizeCollectorUrl(rawUrl, expectedMerchant).url;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "PC-ASSIST-Collector/0.2 (+https://github.com/syouziroupc/choosePC)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      if (redirect === MAX_REDIRECTS) throw new Error("COLLECTOR_TOO_MANY_REDIRECTS");
      const location = response.headers.get("location");
      if (!location) throw new Error("COLLECTOR_INVALID_REDIRECT");
      current = normalizeCollectorUrl(new URL(location, current).toString(), expectedMerchant).url;
      continue;
    }
    if (!response.ok) throw new Error(`COLLECTOR_HTTP_${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) throw new Error("COLLECTOR_NOT_HTML");
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > MAX_REMOTE_HTML_BYTES) throw new Error("COLLECTOR_TOO_LARGE");
    if (!response.body) return { html: "", finalUrl: current.toString() };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let html = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_REMOTE_HTML_BYTES) {
          await reader.cancel();
          throw new Error("COLLECTOR_TOO_LARGE");
        }
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return { html, finalUrl: current.toString() };
  }
  throw new Error("COLLECTOR_TOO_MANY_REDIRECTS");
}

function gpuVariant(category: DeviceCategory, gpu: string | null): "desktop" | "laptop" | "integrated" | "unknown" {
  if (!gpu) return "unknown";
  const normalized = gpu.toLowerCase();
  if (normalized.includes("uhd") || normalized.includes("iris") || normalized.includes("integrated")) return "integrated";
  if (category.includes("laptop")) return "laptop";
  return "desktop";
}

function normalizedPc(source: CollectorSourceRow, extraction: ProductPageExtraction): NormalizedPC {
  return {
    manufacturer: extraction.manufacturer,
    model: extraction.model,
    category: source.category,
    cpu: extraction.cpuRaw
      ? { raw: extraction.cpuRaw, confidence: extraction.confidence.cpu ?? 0 }
      : null,
    gpu: extraction.gpuRaw
      ? {
          raw: extraction.gpuRaw,
          variant: gpuVariant(source.category, extraction.gpuRaw),
          tgpW: null,
          vramGb: null,
          confidence: extraction.confidence.gpu ?? 0,
        }
      : null,
    memory: extraction.ramGb != null ? { sizeGb: extraction.ramGb, upgradeable: null } : null,
    storage: extraction.storageGb != null ? [{ kind: "unknown", sizeGb: extraction.storageGb }] : [],
    condition: { type: source.condition_type, defects: [] },
    commerce: {
      priceJpy: extraction.priceJpy,
      seller: source.merchant,
      warrantyDays: source.warranty_days,
      sourceUrl: extraction.sourceUrl,
    },
    confidence: extraction.confidence,
  };
}

function marketSource(source: CollectorSourceRow, extraction: ProductPageExtraction): TrustedMarketSource {
  if (extraction.stockState === "sold") return "sold_listing";
  return source.merchant === "メルカリ" ? "marketplace_listing" : "retailer_listing";
}

function sourceRecord(row: CollectorSourceRow): CollectorSourceRecord {
  return {
    id: row.id,
    merchant: row.merchant,
    productUrl: row.product_url,
    mode: row.mode,
    category: row.category,
    conditionType: row.condition_type,
    warrantyDays: row.warranty_days,
    enabled: row.enabled === 1,
    refreshMinutes: row.refresh_minutes,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    lastStatus: row.last_status,
    failureCount: row.failure_count,
    lastError: row.last_error,
    parserName: row.parser_name,
    parserVersion: row.parser_version,
  };
}

export function validCollectorSourceInput(value: unknown): value is CollectorSourceInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Partial<CollectorSourceInput>;
  if (typeof input.productUrl !== "string" || input.productUrl.length < 8 || input.productUrl.length > 2048) return false;
  try {
    normalizeCollectorUrl(input.productUrl);
  } catch {
    return false;
  }
  if (!input.mode || !MODES.has(input.mode)) return false;
  if (!input.category || !DEVICE_CATEGORIES.has(input.category)) return false;
  if (!input.conditionType || !CONDITION_TYPES.has(input.conditionType)) return false;
  if (input.warrantyDays != null && (!Number.isInteger(input.warrantyDays) || input.warrantyDays < 0 || input.warrantyDays > 3650)) return false;
  if (input.refreshMinutes != null && (!Number.isInteger(input.refreshMinutes) || input.refreshMinutes < 60 || input.refreshMinutes > 10080)) return false;
  return input.enabled == null || typeof input.enabled === "boolean";
}

export async function upsertCollectorSource(env: PersistenceEnv, input: CollectorSourceInput): Promise<CollectorSourceRecord> {
  const db = env.DB;
  if (!db) throw new Error("COLLECTOR_DB_UNAVAILABLE");
  if (!validCollectorSourceInput(input)) throw new Error("INVALID_COLLECTOR_SOURCE");
  const normalized = normalizeCollectorUrl(input.productUrl);
  const productUrl = normalized.url.toString();
  const id = `collector-${(await sha256Hex(productUrl)).slice(0, 40)}`;
  const refreshMinutes = input.refreshMinutes ?? 360;
  const enabled = input.enabled === false ? 0 : 1;

  await db.prepare(`
    INSERT INTO collector_sources (
      id, merchant, product_url, mode, category, condition_type, warranty_days,
      enabled, refresh_minutes, next_run_at, last_status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending', CURRENT_TIMESTAMP)
    ON CONFLICT(product_url) DO UPDATE SET
      merchant = excluded.merchant,
      mode = excluded.mode,
      category = excluded.category,
      condition_type = excluded.condition_type,
      warranty_days = excluded.warranty_days,
      enabled = excluded.enabled,
      refresh_minutes = excluded.refresh_minutes,
      next_run_at = CASE WHEN excluded.enabled = 1 THEN CURRENT_TIMESTAMP ELSE collector_sources.next_run_at END,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    id,
    normalized.merchant,
    productUrl,
    input.mode,
    input.category,
    input.conditionType,
    input.warrantyDays ?? null,
    enabled,
    refreshMinutes,
  ).run();

  const row = await db.prepare(`
    SELECT id, merchant, product_url, mode, category, condition_type, warranty_days,
      enabled, refresh_minutes, next_run_at, last_run_at, last_success_at,
      last_status, failure_count, last_error, parser_name, parser_version
    FROM collector_sources WHERE product_url = ? LIMIT 1
  `).bind(productUrl).first<CollectorSourceRow>();
  if (!row) throw new Error("COLLECTOR_SOURCE_NOT_FOUND");
  return sourceRecord(row);
}

async function markSource(args: {
  db: D1Database;
  source: CollectorSourceRow;
  outcome: RunOutcome;
  error: string | null;
  extraction?: ProductPageExtraction;
}): Promise<void> {
  const success = args.outcome === "success" || args.outcome === "partial";
  await args.db.prepare(`
    UPDATE collector_sources SET
      last_run_at = CURRENT_TIMESTAMP,
      last_success_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE last_success_at END,
      last_status = ?,
      failure_count = CASE WHEN ? THEN 0 ELSE failure_count + 1 END,
      last_error = ?,
      parser_name = COALESCE(?, parser_name),
      parser_version = COALESCE(?, parser_version),
      next_run_at = datetime(CURRENT_TIMESTAMP, '+' || refresh_minutes || ' minutes'),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    success ? 1 : 0,
    args.outcome,
    success ? 1 : 0,
    args.error,
    args.extraction?.parserName ?? null,
    args.extraction?.parserVersion ?? null,
    args.source.id,
  ).run();
}

async function runSource(env: PersistenceEnv, source: CollectorSourceRow): Promise<RunOutcome> {
  const db = env.DB;
  if (!db) throw new Error("COLLECTOR_DB_UNAVAILABLE");
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await db.prepare(`
    INSERT INTO collector_runs (id, source_id, started_at, status)
    VALUES (?, ?, ?, 'running')
  `).bind(runId, source.id, startedAt).run();

  try {
    const fetched = await fetchLimitedHtml(source.product_url, source.merchant);
    const extraction = extractProductPage(fetched.html, fetched.finalUrl);
    const pc = normalizedPc(source, extraction);
    const hasIdentity = Boolean(extraction.cpuRaw || extraction.gpuRaw);
    const hasPrice = extraction.priceJpy != null && extraction.priceJpy >= 100;
    const title = extraction.title?.trim() || null;
    let marketObservationId: string | null = null;
    let offerId: string | null = null;
    const modeOffer = source.mode === "offer" || source.mode === "both";
    const modeMarket = source.mode === "market" || source.mode === "both";
    const unavailable = ["out_of_stock", "unavailable"].includes(extraction.stockState);

    if (modeMarket && hasIdentity && hasPrice && !unavailable) {
      const stored = await persistTrustedMarketObservation({
        env,
        observation: {
          pc,
          priceJpy: extraction.priceJpy!,
          observedAt: startedAt,
          source: marketSource(source, extraction),
          merchant: source.merchant,
          productUrl: fetched.finalUrl,
        },
      });
      marketObservationId = stored.id;
    }

    if (modeOffer && title && hasIdentity && hasPrice && !["sold", "out_of_stock", "unavailable"].includes(extraction.stockState)) {
      const stored = await upsertTrustedMerchantOffer({
        env,
        offer: {
          merchant: source.merchant,
          title,
          priceJpy: extraction.priceJpy!,
          productUrl: fetched.finalUrl,
          stockState: extraction.stockState,
          pc,
          observedAt: startedAt,
        },
      });
      offerId = stored.id;
    }

    const requestedWrites = Number(modeMarket) + Number(modeOffer);
    const completedWrites = Number(Boolean(marketObservationId)) + Number(Boolean(offerId));
    const outcome: RunOutcome = hasIdentity && hasPrice && completedWrites === requestedWrites
      ? "success"
      : completedWrites > 0 || (hasIdentity && hasPrice) ? "partial" : "skipped";
    const error = !hasPrice ? "COLLECTOR_PRICE_MISSING" : !hasIdentity ? "COLLECTOR_IDENTITY_MISSING" : null;

    await db.prepare(`
      UPDATE collector_runs SET
        completed_at = CURRENT_TIMESTAMP,
        status = ?, parser_name = ?, parser_version = ?, extracted_title = ?,
        extracted_price_jpy = ?, stock_state = ?, market_observation_id = ?, offer_id = ?,
        error_code = ?, extraction_json = ?
      WHERE id = ?
    `).bind(
      outcome,
      extraction.parserName,
      extraction.parserVersion,
      title,
      extraction.priceJpy,
      extraction.stockState,
      marketObservationId,
      offerId,
      error,
      safeJson(extraction),
      runId,
    ).run();
    await markSource({ db, source, outcome, error, extraction });
    return outcome;
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "COLLECTOR_UNKNOWN_ERROR";
    await db.prepare(`
      UPDATE collector_runs SET completed_at = CURRENT_TIMESTAMP, status = 'failed', error_code = ? WHERE id = ?
    `).bind(error.slice(0, 240), runId).run();
    await markSource({ db, source, outcome: "failed", error: error.slice(0, 240) });
    console.error(JSON.stringify({ event: "collector_error", source_id: source.id, merchant: source.merchant, error }));
    return "failed";
  }
}

export async function runDueCollectors(env: PersistenceEnv, options: { limit?: number; force?: boolean } = {}): Promise<CollectorBatchResult> {
  const db = env.DB;
  if (!db) return { attempted: 0, success: 0, partial: 0, failed: 0, skipped: 0 };
  const limit = Math.max(1, Math.min(MAX_BATCH, Math.floor(options.limit ?? DEFAULT_BATCH)));
  const dueClause = options.force ? "" : "AND datetime(next_run_at) <= CURRENT_TIMESTAMP";
  const rows = await db.prepare(`
    SELECT id, merchant, product_url, mode, category, condition_type, warranty_days,
      enabled, refresh_minutes, next_run_at, last_run_at, last_success_at,
      last_status, failure_count, last_error, parser_name, parser_version
    FROM collector_sources
    WHERE enabled = 1 ${dueClause}
    ORDER BY datetime(next_run_at) ASC, id ASC
    LIMIT ?
  `).bind(limit).all<CollectorSourceRow>();

  const result: CollectorBatchResult = { attempted: 0, success: 0, partial: 0, failed: 0, skipped: 0 };
  for (const source of rows.results ?? []) {
    result.attempted += 1;
    const outcome = await runSource(env, source);
    result[outcome] += 1;
  }
  return result;
}

export async function loadCollectorSources(env: PersistenceEnv, limit = 100): Promise<CollectorSourceRecord[]> {
  const db = env.DB;
  if (!db) return [];
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await db.prepare(`
    SELECT id, merchant, product_url, mode, category, condition_type, warranty_days,
      enabled, refresh_minutes, next_run_at, last_run_at, last_success_at,
      last_status, failure_count, last_error, parser_name, parser_version
    FROM collector_sources
    ORDER BY enabled DESC, datetime(next_run_at) ASC, merchant ASC
    LIMIT ?
  `).bind(safeLimit).all<CollectorSourceRow>();
  return (rows.results ?? []).map(sourceRecord);
}
