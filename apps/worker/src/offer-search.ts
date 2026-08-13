import type { NormalizedPC, RecommendationCandidate } from "../../../packages/core/src/index";
import type { PersistenceEnv } from "./persistence";

type OfferRow = {
  id: string;
  price_jpy: number;
  normalized_pc_json: string;
  observed_at: string;
};

export interface OfferSearchFilters {
  category?: string | null;
  maxPriceJpy?: number | null;
  conditions?: readonly string[] | null;
  maxCandidates?: number;
}

export interface NeutralOfferSearchResult {
  candidates: RecommendationCandidate[];
  scannedRows: number;
  skippedRows: number;
}

const MAX_SCAN_ROWS = 120;
const DEFAULT_CANDIDATES = 20;
const MAX_CANDIDATES = 40;
const OFFER_MAX_AGE_DAYS = 30;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStoredPc(row: OfferRow): NormalizedPC | null {
  try {
    const parsed = JSON.parse(row.normalized_pc_json) as unknown;
    if (!isRecord(parsed)) return null;
    if (typeof parsed.category !== "string" || !DEVICE_CATEGORIES.has(parsed.category)) return null;
    if (!isRecord(parsed.condition) || typeof parsed.condition.type !== "string" || !CONDITION_TYPES.has(parsed.condition.type)) return null;
    if (!isRecord(parsed.commerce) || !isRecord(parsed.confidence)) return null;
    if (!Number.isFinite(row.price_jpy) || row.price_jpy < 0 || row.price_jpy > 100_000_000) return null;

    const pc = parsed as unknown as NormalizedPC;
    return {
      ...pc,
      commerce: {
        ...pc.commerce,
        priceJpy: row.price_jpy,
      },
    };
  } catch {
    return null;
  }
}

function matchesFilters(pc: NormalizedPC, filters: OfferSearchFilters): boolean {
  if (filters.category && pc.category !== filters.category) return false;
  if (filters.conditions?.length && !filters.conditions.includes(pc.condition.type)) return false;
  return true;
}

/**
 * Loads only fields required to construct an evaluation candidate. Merchant identity, affiliate
 * URLs, commercial programs and commission values are absent before rank is frozen.
 */
export async function loadNeutralOfferCandidates(env: PersistenceEnv, filters: OfferSearchFilters = {}): Promise<NeutralOfferSearchResult> {
  const db = env.DB;
  if (!db) return { candidates: [], scannedRows: 0, skippedRows: 0 };

  const maxCandidates = Math.max(1, Math.min(MAX_CANDIDATES, Math.floor(filters.maxCandidates ?? DEFAULT_CANDIDATES)));
  const maxPrice = filters.maxPriceJpy != null
    ? Math.max(0, Math.min(100_000_000, Math.floor(filters.maxPriceJpy)))
    : 100_000_000;
  const cutoff = new Date(Date.now() - OFFER_MAX_AGE_DAYS * 86_400_000).toISOString();

  try {
    const rows = await db.prepare(`
      SELECT id, price_jpy, normalized_pc_json, observed_at
      FROM merchant_offers
      WHERE price_jpy <= ?
        AND observed_at >= ?
        AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
        AND (stock_state IS NULL OR lower(stock_state) NOT IN ('out_of_stock', 'sold', 'unavailable'))
      ORDER BY observed_at DESC
      LIMIT ?
    `).bind(maxPrice, cutoff, MAX_SCAN_ROWS).all<OfferRow>();

    const candidates: RecommendationCandidate[] = [];
    let skippedRows = 0;
    for (const row of rows.results ?? []) {
      const pc = parseStoredPc(row);
      if (!pc || !matchesFilters(pc, filters)) {
        skippedRows += 1;
        continue;
      }
      candidates.push({ candidateId: row.id, pc, market: null });
      if (candidates.length >= maxCandidates) break;
    }

    return {
      candidates,
      scannedRows: rows.results?.length ?? 0,
      skippedRows,
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "offer_search_error",
      error: error instanceof Error ? error.message : String(error),
    }));
    return { candidates: [], scannedRows: 0, skippedRows: 0 };
  }
}
