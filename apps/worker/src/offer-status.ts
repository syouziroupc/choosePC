import { OFFER_MAX_AGE_DAYS } from "./offer-store";
import type { PersistenceEnv } from "./persistence";

export interface MerchantOfferIngestionStatus {
  merchant: string;
  total: number;
  eligible: number;
  latestObservedAt: string | null;
}

export interface OfferIngestionStatus {
  generatedAt: string;
  maxAgeDays: number;
  total: number;
  merchantCount: number;
  eligible: number;
  stale: number;
  expired: number;
  unavailable: number;
  expiringWithin24Hours: number;
  newestObservedAt: string | null;
  merchants: MerchantOfferIngestionStatus[];
}

type SummaryRow = {
  total: number;
  merchant_count: number;
  eligible: number;
  stale: number;
  expired: number;
  unavailable: number;
  expiring_24h: number;
  newest_observed_at: string | null;
};

type MerchantRow = {
  merchant: string;
  total: number;
  eligible: number;
  latest_observed_at: string | null;
};

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function loadOfferIngestionStatus(env: PersistenceEnv): Promise<OfferIngestionStatus | null> {
  const db = env.DB;
  if (!db) return null;
  const generatedAt = new Date().toISOString();
  const cutoff = new Date(Date.now() - OFFER_MAX_AGE_DAYS * 86_400_000).toISOString();
  const unavailableSql = "lower(coalesce(stock_state, '')) IN ('out_of_stock', 'sold', 'unavailable')";
  const eligibleSql = `
    datetime(observed_at) >= datetime(?)
    AND (expires_at IS NULL OR datetime(expires_at) >= CURRENT_TIMESTAMP)
    AND NOT (${unavailableSql})
  `;

  const summary = await db.prepare(`
    SELECT
      COUNT(*) AS total,
      COUNT(DISTINCT merchant) AS merchant_count,
      COALESCE(SUM(CASE WHEN ${eligibleSql} THEN 1 ELSE 0 END), 0) AS eligible,
      COALESCE(SUM(CASE WHEN datetime(observed_at) < datetime(?) THEN 1 ELSE 0 END), 0) AS stale,
      COALESCE(SUM(CASE WHEN expires_at IS NOT NULL AND datetime(expires_at) < CURRENT_TIMESTAMP THEN 1 ELSE 0 END), 0) AS expired,
      COALESCE(SUM(CASE WHEN ${unavailableSql} THEN 1 ELSE 0 END), 0) AS unavailable,
      COALESCE(SUM(CASE
        WHEN ${eligibleSql}
          AND expires_at IS NOT NULL
          AND datetime(expires_at) < datetime(CURRENT_TIMESTAMP, '+1 day')
        THEN 1 ELSE 0 END), 0) AS expiring_24h,
      MAX(observed_at) AS newest_observed_at
    FROM merchant_offers
  `).bind(cutoff, cutoff, cutoff).first<SummaryRow>();

  const merchants = await db.prepare(`
    SELECT
      merchant,
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN ${eligibleSql} THEN 1 ELSE 0 END), 0) AS eligible,
      MAX(observed_at) AS latest_observed_at
    FROM merchant_offers
    GROUP BY merchant
    ORDER BY latest_observed_at DESC, merchant ASC
    LIMIT 100
  `).bind(cutoff).all<MerchantRow>();

  return {
    generatedAt,
    maxAgeDays: OFFER_MAX_AGE_DAYS,
    total: numeric(summary?.total),
    merchantCount: numeric(summary?.merchant_count),
    eligible: numeric(summary?.eligible),
    stale: numeric(summary?.stale),
    expired: numeric(summary?.expired),
    unavailable: numeric(summary?.unavailable),
    expiringWithin24Hours: numeric(summary?.expiring_24h),
    newestObservedAt: summary?.newest_observed_at ?? null,
    merchants: (merchants.results ?? []).map((row) => ({
      merchant: row.merchant,
      total: numeric(row.total),
      eligible: numeric(row.eligible),
      latestObservedAt: row.latest_observed_at,
    })),
  };
}
