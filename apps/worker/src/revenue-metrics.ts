import type { PersistenceEnv } from "./persistence";

export interface RevenueProgramMetric {
  programId: string;
  merchant: string | null;
  programType: string | null;
  clicks: number;
  approvedConversions: number;
  approvedOrderValueJpy: number;
  approvedCommissionJpy: number;
  pendingCommissionJpy: number;
}

export interface RevenueMetrics {
  windowDays: number;
  since: string;
  evaluations: number;
  recommendationRuns: number;
  outboundClicks: number;
  clicksByMerchantType: Record<string, number>;
  conversions: number;
  attributedConversions: number;
  approvedConversions: number;
  pendingConversions: number;
  rejectedOrReversedConversions: number;
  approvedOrderValueJpy: number;
  approvedCommissionJpy: number;
  pendingCommissionJpy: number;
  clickToApprovedConversionPct: number | null;
  normalized30DayApprovedCommissionJpy: number | null;
  topPrograms: RevenueProgramMetric[];
}

type FunnelRow = {
  evaluations: number;
  recommendation_runs: number;
  outbound_clicks: number;
};

type ConversionRow = {
  conversions: number;
  attributed_conversions: number;
  approved_conversions: number;
  pending_conversions: number;
  rejected_or_reversed: number;
  approved_order_value_jpy: number;
  approved_commission_jpy: number;
  pending_commission_jpy: number;
};

type MerchantTypeRow = { merchant_type: string; clicks: number };

type ProgramRow = {
  program_id: string;
  merchant: string | null;
  program_type: string | null;
  clicks: number;
  approved_conversions: number;
  approved_order_value_jpy: number;
  approved_commission_jpy: number;
  pending_commission_jpy: number;
};

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

export async function loadRevenueMetrics(env: PersistenceEnv, requestedDays = 30): Promise<RevenueMetrics | null> {
  const db = env.DB;
  if (!db) return null;
  const windowDays = Math.max(1, Math.min(365, Math.floor(requestedDays)));
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  const funnel = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM evaluation_runs WHERE created_at >= ?) AS evaluations,
      (SELECT COUNT(*) FROM recommendation_runs WHERE created_at >= ?) AS recommendation_runs,
      (SELECT COUNT(*) FROM outbound_clicks WHERE clicked_at >= ?) AS outbound_clicks
  `).bind(since, since, since).first<FunnelRow>();

  const conversion = await db.prepare(`
    SELECT
      COUNT(*) AS conversions,
      SUM(CASE WHEN outbound_click_id IS NOT NULL THEN 1 ELSE 0 END) AS attributed_conversions,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_conversions,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_conversions,
      SUM(CASE WHEN status IN ('rejected', 'cancelled', 'refunded') THEN 1 ELSE 0 END) AS rejected_or_reversed,
      COALESCE(SUM(CASE WHEN status = 'approved' THEN order_value_jpy ELSE 0 END), 0) AS approved_order_value_jpy,
      COALESCE(SUM(CASE WHEN status = 'approved' THEN commission_jpy ELSE 0 END), 0) AS approved_commission_jpy,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_jpy ELSE 0 END), 0) AS pending_commission_jpy
    FROM conversion_events
    WHERE occurred_at >= ?
  `).bind(since).first<ConversionRow>();

  const merchantTypes = await db.prepare(`
    SELECT merchant_type, COUNT(*) AS clicks
    FROM outbound_clicks
    WHERE clicked_at >= ?
    GROUP BY merchant_type
    ORDER BY merchant_type
  `).bind(since).all<MerchantTypeRow>();

  const programs = await db.prepare(`
    SELECT
      oc.program_id,
      cp.merchant,
      cp.program_type,
      COUNT(DISTINCT oc.id) AS clicks,
      COUNT(DISTINCT CASE WHEN ce.status = 'approved' THEN ce.id END) AS approved_conversions,
      COALESCE(SUM(CASE WHEN ce.status = 'approved' THEN ce.order_value_jpy ELSE 0 END), 0) AS approved_order_value_jpy,
      COALESCE(SUM(CASE WHEN ce.status = 'approved' THEN ce.commission_jpy ELSE 0 END), 0) AS approved_commission_jpy,
      COALESCE(SUM(CASE WHEN ce.status = 'pending' THEN ce.commission_jpy ELSE 0 END), 0) AS pending_commission_jpy
    FROM outbound_clicks oc
    LEFT JOIN commercial_programs cp ON cp.id = oc.program_id
    LEFT JOIN conversion_events ce
      ON ce.outbound_click_id = oc.id
      AND ce.occurred_at >= ?
    WHERE oc.clicked_at >= ?
      AND oc.program_id IS NOT NULL
    GROUP BY oc.program_id, cp.merchant, cp.program_type
    ORDER BY approved_commission_jpy DESC, clicks DESC, oc.program_id ASC
    LIMIT 10
  `).bind(since, since).all<ProgramRow>();

  const outboundClicks = numeric(funnel?.outbound_clicks);
  const approvedConversions = numeric(conversion?.approved_conversions);
  const approvedCommission = numeric(conversion?.approved_commission_jpy);
  const clicksByMerchantType: Record<string, number> = {};
  for (const row of merchantTypes.results ?? []) clicksByMerchantType[row.merchant_type] = numeric(row.clicks);

  return {
    windowDays,
    since,
    evaluations: numeric(funnel?.evaluations),
    recommendationRuns: numeric(funnel?.recommendation_runs),
    outboundClicks,
    clicksByMerchantType,
    conversions: numeric(conversion?.conversions),
    attributedConversions: numeric(conversion?.attributed_conversions),
    approvedConversions,
    pendingConversions: numeric(conversion?.pending_conversions),
    rejectedOrReversedConversions: numeric(conversion?.rejected_or_reversed),
    approvedOrderValueJpy: numeric(conversion?.approved_order_value_jpy),
    approvedCommissionJpy: approvedCommission,
    pendingCommissionJpy: numeric(conversion?.pending_commission_jpy),
    clickToApprovedConversionPct: pct(approvedConversions, outboundClicks),
    normalized30DayApprovedCommissionJpy: approvedCommission > 0
      ? Math.round((approvedCommission / windowDays) * 30)
      : approvedCommission === 0 ? 0 : null,
    topPrograms: (programs.results ?? []).map((row) => ({
      programId: row.program_id,
      merchant: row.merchant,
      programType: row.program_type,
      clicks: numeric(row.clicks),
      approvedConversions: numeric(row.approved_conversions),
      approvedOrderValueJpy: numeric(row.approved_order_value_jpy),
      approvedCommissionJpy: numeric(row.approved_commission_jpy),
      pendingCommissionJpy: numeric(row.pending_commission_jpy),
    })),
  };
}
