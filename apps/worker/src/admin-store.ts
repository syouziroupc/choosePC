import type { PersistenceEnv } from "./persistence";

type CountSummaryRow = {
  today: number | null;
  last7Days: number | null;
  last30Days: number | null;
};

type EndpointMetricRow = {
  path: string;
  method: string;
  requestCount: number;
  lastSeenAt: string | null;
};

type ProgramRow = {
  id: string;
  merchant: string;
  programType: string;
  status: string;
  commissionJson: string | null;
  disclosureText: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
  clickRefParam: string | null;
  linkCount: number;
  updatedAt: string;
};

type AttributionRow = {
  id: string;
  offerId: string;
  programId: string;
  merchant: string;
  title: string;
  priceJpy: number;
  stockState: string | null;
  productUrl: string;
  destinationUrl: string;
  programType: string;
  programStatus: string;
};

type OfferRow = {
  id: string;
  merchant: string;
  title: string;
  priceJpy: number;
  stockState: string | null;
  productUrl: string;
  observedAt: string;
  expiresAt: string | null;
  attributionCount: number;
};

type CommercialActivityRow = {
  outbound30Days: number | null;
  affiliateOutbound30Days: number | null;
  conversions30Days: number | null;
  commission30DaysJpy: number | null;
};

function resultRows<T>(value: D1Result<T>): T[] {
  return Array.isArray(value.results) ? value.results : [];
}

export function normalizeApiMetricPath(pathname: string): string {
  if (/^\/api\/v1\/outbound\/[^/]+$/.test(pathname)) return "/api/v1/outbound/:offerId";
  return pathname;
}

export async function recordApiRequest(args: {
  env: PersistenceEnv;
  pathname: string;
  method: string;
  status: number;
}): Promise<void> {
  const db = args.env.DB;
  if (!db) return;
  const day = new Date().toISOString().slice(0, 10);
  try {
    await db.prepare(`
      INSERT INTO api_request_metrics (day, path, method, status, request_count, last_seen_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(day, path, method, status) DO UPDATE SET
        request_count = api_request_metrics.request_count + 1,
        last_seen_at = CURRENT_TIMESTAMP
    `).bind(
      day,
      normalizeApiMetricPath(args.pathname),
      args.method.toUpperCase(),
      args.status,
    ).run();
  } catch (error) {
    console.error(JSON.stringify({
      event: "persistence_error",
      operation: "api_request_metric",
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

export async function loadAdminOverview(env: PersistenceEnv): Promise<{
  generatedAt: string;
  requests: {
    today: number;
    last7Days: number;
    last30Days: number;
    endpoints: EndpointMetricRow[];
  };
  commercial: {
    programs: ProgramRow[];
    attributionLinks: AttributionRow[];
    offers: OfferRow[];
    activity30Days: {
      outbound: number;
      affiliateOutbound: number;
      conversions: number;
      commissionJpy: number;
    };
  };
}> {
  const db = env.DB;
  if (!db) throw new Error("ADMIN_DB_UNAVAILABLE");

  const summary = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN day = date('now') THEN request_count ELSE 0 END), 0) AS today,
      COALESCE(SUM(CASE WHEN day >= date('now', '-6 day') THEN request_count ELSE 0 END), 0) AS last7Days,
      COALESCE(SUM(CASE WHEN day >= date('now', '-29 day') THEN request_count ELSE 0 END), 0) AS last30Days
    FROM api_request_metrics
  `).first<CountSummaryRow>();

  const endpointsResult = await db.prepare(`
    SELECT
      path,
      method,
      SUM(request_count) AS requestCount,
      MAX(last_seen_at) AS lastSeenAt
    FROM api_request_metrics
    WHERE day >= date('now', '-6 day')
    GROUP BY path, method
    ORDER BY requestCount DESC, path ASC
    LIMIT 100
  `).all<EndpointMetricRow>();

  const programsResult = await db.prepare(`
    SELECT
      cp.id,
      cp.merchant,
      cp.program_type AS programType,
      cp.status,
      cp.commission_json AS commissionJson,
      cp.disclosure_text AS disclosureText,
      cp.source_url AS sourceUrl,
      cp.last_verified_at AS lastVerifiedAt,
      cp.click_ref_param AS clickRefParam,
      COUNT(al.id) AS linkCount,
      cp.updated_at AS updatedAt
    FROM commercial_programs cp
    LEFT JOIN attribution_links al ON al.program_id = cp.id
    GROUP BY cp.id
    ORDER BY cp.status = 'active' DESC, cp.updated_at DESC, cp.merchant ASC
    LIMIT 100
  `).all<ProgramRow>();

  const linksResult = await db.prepare(`
    SELECT
      al.id,
      al.offer_id AS offerId,
      al.program_id AS programId,
      mo.merchant,
      mo.title,
      mo.price_jpy AS priceJpy,
      mo.stock_state AS stockState,
      mo.product_url AS productUrl,
      al.destination_url AS destinationUrl,
      cp.program_type AS programType,
      cp.status AS programStatus
    FROM attribution_links al
    JOIN merchant_offers mo ON mo.id = al.offer_id
    JOIN commercial_programs cp ON cp.id = al.program_id
    ORDER BY cp.status = 'active' DESC, mo.observed_at DESC, mo.merchant ASC
    LIMIT 250
  `).all<AttributionRow>();

  const offersResult = await db.prepare(`
    SELECT
      mo.id,
      mo.merchant,
      mo.title,
      mo.price_jpy AS priceJpy,
      mo.stock_state AS stockState,
      mo.product_url AS productUrl,
      mo.observed_at AS observedAt,
      mo.expires_at AS expiresAt,
      COUNT(al.id) AS attributionCount
    FROM merchant_offers mo
    LEFT JOIN attribution_links al ON al.offer_id = mo.id
    GROUP BY mo.id
    ORDER BY mo.observed_at DESC
    LIMIT 200
  `).all<OfferRow>();

  const activity = await db.prepare(`
    SELECT
      COALESCE((SELECT COUNT(*) FROM outbound_clicks WHERE clicked_at >= datetime('now', '-30 day')), 0) AS outbound30Days,
      COALESCE((SELECT COUNT(*) FROM outbound_clicks WHERE clicked_at >= datetime('now', '-30 day') AND merchant_type = 'affiliate'), 0) AS affiliateOutbound30Days,
      COALESCE((SELECT COUNT(*) FROM conversion_events WHERE occurred_at >= datetime('now', '-30 day')), 0) AS conversions30Days,
      COALESCE((SELECT SUM(commission_jpy) FROM conversion_events WHERE occurred_at >= datetime('now', '-30 day') AND status = 'approved'), 0) AS commission30DaysJpy
  `).first<CommercialActivityRow>();

  return {
    generatedAt: new Date().toISOString(),
    requests: {
      today: Number(summary?.today ?? 0),
      last7Days: Number(summary?.last7Days ?? 0),
      last30Days: Number(summary?.last30Days ?? 0),
      endpoints: resultRows(endpointsResult),
    },
    commercial: {
      programs: resultRows(programsResult),
      attributionLinks: resultRows(linksResult),
      offers: resultRows(offersResult),
      activity30Days: {
        outbound: Number(activity?.outbound30Days ?? 0),
        affiliateOutbound: Number(activity?.affiliateOutbound30Days ?? 0),
        conversions: Number(activity?.conversions30Days ?? 0),
        commissionJpy: Number(activity?.commission30DaysJpy ?? 0),
      },
    },
  };
}
