import {
  createProductSignature,
  estimateMarket,
  resolveHardware,
  signatureSimilarity,
  type MarketEstimate,
  type MarketObservationInput,
  type NormalizedPC,
  type ProductSignature,
} from "../../../packages/core/src/index";
import type { PersistenceEnv } from "./persistence";

export type TrustedMarketSource =
  | "retailer_listing"
  | "marketplace_listing"
  | "sold_listing"
  | "curated_manual"
  | "own_inventory";

export interface TrustedMarketObservation {
  pc: NormalizedPC;
  priceJpy: number;
  observedAt: string;
  source: TrustedMarketSource;
  merchant?: string | null;
  productUrl?: string | null;
}

export interface StoredMarketLookup {
  estimate: MarketEstimate | null;
  productSignature: string;
  signatureQuality: "exact_model" | "configuration" | "partial";
  acceptedSamples: number;
  rejectedSamples: number;
}

type ObservationRow = {
  product_signature: string;
  price_jpy: number;
  observed_at: string;
  source: TrustedMarketSource | string;
  similarity_json: string | null;
};

type RecentUrlRow = { observed_at: string };

const SOURCE_CONFIDENCE: Readonly<Record<TrustedMarketSource, number>> = {
  retailer_listing: 0.88,
  marketplace_listing: 0.62,
  sold_listing: 0.94,
  curated_manual: 0.82,
  own_inventory: 0.86,
};

const MAX_LOOKBACK_DAYS = 365;
const MAX_SAMPLES = 300;
const MAX_CANDIDATE_ROWS = 600;
const MIN_SIMILARITY = 0.55;
const URL_DEDUPE_HOURS = 18;

function sourceConfidence(source: string): number {
  return SOURCE_CONFIDENCE[source as TrustedMarketSource] ?? 0.5;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeHttpsUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function resolvedSignature(pc: NormalizedPC) {
  const hardware = resolveHardware(pc.cpu?.raw, pc.gpu?.raw, pc.gpu?.tgpW, {
    cpuConfidence: pc.cpu?.confidence,
    gpuConfidence: pc.gpu?.confidence,
    gpuVariant: pc.gpu?.variant,
  });
  return { hardware, signature: createProductSignature(pc, hardware) };
}

function totalStorageMb(pc: NormalizedPC): number | null {
  const gb = pc.storage?.reduce((sum, item) => sum + (item.sizeGb ?? 0), 0) ?? 0;
  return gb > 0 ? Math.round(gb * 1024) : null;
}

async function isRecentDuplicate(db: D1Database, productSignature: string, urlHash: string, observedAt: string): Promise<boolean> {
  const recent = await db.prepare(`
    SELECT observed_at
    FROM market_observations
    WHERE product_signature = ? AND url_hash = ?
    ORDER BY observed_at DESC
    LIMIT 1
  `).bind(productSignature, urlHash).first<RecentUrlRow>();
  if (!recent?.observed_at) return false;
  const previous = new Date(recent.observed_at).getTime();
  const next = new Date(observedAt).getTime();
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return false;
  return Math.abs(next - previous) < URL_DEDUPE_HOURS * 3_600_000;
}

export async function persistTrustedMarketObservation(args: {
  env: PersistenceEnv;
  observation: TrustedMarketObservation;
}): Promise<{ id: string | null; productSignature: string; duplicate: boolean }> {
  const db = args.env.DB;
  const { pc } = args.observation;
  const { hardware, signature } = resolvedSignature(pc);
  if (!db) return { id: null, productSignature: signature.key, duplicate: false };

  const normalizedUrl = normalizeHttpsUrl(args.observation.productUrl);
  const urlHash = normalizedUrl ? await sha256Hex(normalizedUrl) : null;
  if (urlHash && await isRecentDuplicate(db, signature.key, urlHash, args.observation.observedAt)) {
    return { id: null, productSignature: signature.key, duplicate: true };
  }

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO market_observations (
      id, product_signature, source, merchant, price_jpy, condition_type,
      cpu_id, gpu_id, ram_mb, storage_mb, similarity_json, observed_at, url_hash, raw_snapshot_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    signature.key,
    args.observation.source,
    args.observation.merchant ?? null,
    Math.round(args.observation.priceJpy),
    pc.condition.type,
    null,
    null,
    pc.memory?.sizeGb != null ? Math.round(pc.memory.sizeGb * 1024) : null,
    totalStorageMb(pc),
    safeJson({
      signature: { quality: signature.quality, components: signature.components },
      signatureQuality: signature.quality,
      sourceConfidence: sourceConfidence(args.observation.source),
      resolvedCpuId: hardware.cpuId ?? null,
      resolvedGpuId: hardware.gpuId ?? null,
      hardwareKnowledgeSeeded: false,
    }),
    args.observation.observedAt,
    urlHash,
    null,
  ).run();
  return { id, productSignature: signature.key, duplicate: false };
}

function storedSignature(row: ObservationRow, target: ProductSignature): ProductSignature | null {
  if (row.product_signature === target.key) return target;
  if (!row.similarity_json) return null;
  try {
    const metadata = JSON.parse(row.similarity_json) as { signature?: { quality?: unknown; components?: unknown } };
    const quality = metadata.signature?.quality;
    const components = metadata.signature?.components;
    if (quality !== "exact_model" && quality !== "configuration" && quality !== "partial") return null;
    if (!components || typeof components !== "object" || Array.isArray(components)) return null;
    return { key: row.product_signature, quality, components: components as ProductSignature["components"] };
  } catch {
    return null;
  }
}

export async function lookupStoredMarket(env: PersistenceEnv, pc: NormalizedPC): Promise<StoredMarketLookup | null> {
  const db = env.DB;
  if (!db) return null;
  const { signature } = resolvedSignature(pc);
  try {
    const cutoff = new Date(Date.now() - MAX_LOOKBACK_DAYS * 86_400_000).toISOString();
    const rows = await db.prepare(`
      SELECT product_signature, price_jpy, observed_at, source, similarity_json
      FROM market_observations
      WHERE observed_at >= ?
        AND (
          ? = 'unknown'
          OR condition_type = ?
          OR (? IN ('used', 'refurbished') AND condition_type IN ('used', 'refurbished'))
        )
      ORDER BY observed_at DESC
      LIMIT ?
    `).bind(cutoff, pc.condition.type, pc.condition.type, pc.condition.type, MAX_CANDIDATE_ROWS).all<ObservationRow>();

    const observations: MarketObservationInput[] = [];
    for (const row of rows.results ?? []) {
      const candidate = storedSignature(row, signature);
      if (!candidate) continue;
      const similarity = signatureSimilarity(signature, candidate);
      if (similarity < MIN_SIMILARITY) continue;
      observations.push({
        priceJpy: row.price_jpy,
        observedAt: row.observed_at,
        similarity,
        sourceConfidence: sourceConfidence(row.source),
      });
      if (observations.length >= MAX_SAMPLES) break;
    }
    const result = estimateMarket(observations);
    return {
      estimate: result.estimate,
      productSignature: signature.key,
      signatureQuality: signature.quality,
      acceptedSamples: result.acceptedSamples,
      rejectedSamples: result.rejectedSamples,
    };
  } catch (error) {
    console.error(JSON.stringify({ event: "market_lookup_error", error: error instanceof Error ? error.message : String(error) }));
    return null;
  }
}

export async function persistMarketEstimate(args: {
  env: PersistenceEnv;
  lookup: StoredMarketLookup;
  engineVersion?: string;
}): Promise<void> {
  const db = args.env.DB;
  const estimate = args.lookup.estimate;
  if (!db || !estimate) return;
  try {
    await db.prepare(`
      INSERT INTO market_estimates (
        id, product_signature, fair_price_jpy, low_price_jpy, high_price_jpy,
        sample_count, confidence, computed_at, engine_version, filters_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      args.lookup.productSignature,
      estimate.fairPriceJpy,
      estimate.lowPriceJpy ?? null,
      estimate.highPriceJpy ?? null,
      estimate.sampleCount,
      estimate.confidence,
      new Date().toISOString(),
      args.engineVersion ?? "market-0.3",
      safeJson({ signatureQuality: args.lookup.signatureQuality, acceptedSamples: args.lookup.acceptedSamples, rejectedSamples: args.lookup.rejectedSamples }),
    ).run();
  } catch (error) {
    console.error(JSON.stringify({
      event: "persistence_error",
      operation: "market_estimate",
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
