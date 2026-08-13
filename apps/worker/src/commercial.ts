import {
  attachCommercialMetadata,
  type CommercialOfferMetadata,
  type MerchantType,
  type RankedOffer,
} from "../../../packages/core/src/index";
import type { PersistenceEnv } from "./persistence";

type CommercialRow = {
  offer_id: string;
  merchant: string;
  title: string;
  price_jpy: number;
  product_url: string;
  program_type: MerchantType | null;
  program_status: string | null;
  destination_url: string | null;
  disclosure_text: string | null;
};

export interface CommercialPresentation {
  offerId: string;
  rank: number;
  evaluationScore: number;
  merchant: string;
  title: string;
  priceJpy: number;
  merchantType: MerchantType;
  disclosureRequired: boolean;
  disclosureText: string | null;
  outboundPath: string;
}

export interface OutboundDestination {
  offerId: string;
  merchant: string;
  merchantType: MerchantType;
  destinationUrl: string;
}

function safeHttpsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function commercialChoice(rows: readonly CommercialRow[]): {
  metadata: CommercialOfferMetadata;
  merchant: string;
  title: string;
  priceJpy: number;
  disclosureText: string | null;
} | null {
  if (!rows.length) return null;

  const withActiveProgram = rows.filter((row) => row.program_status === "active" && row.program_type && row.destination_url);
  const selected = withActiveProgram.find((row) => row.program_type === "own")
    ?? withActiveProgram.find((row) => row.program_type === "affiliate")
    ?? withActiveProgram[0]
    ?? rows[0];

  const programType = selected.program_status === "active" && selected.program_type ? selected.program_type : "normal";
  const destination = safeHttpsUrl(
    selected.program_status === "active" && selected.destination_url
      ? selected.destination_url
      : selected.product_url,
  );
  if (!destination) return null;

  return {
    metadata: {
      offerId: selected.offer_id,
      merchantType: programType,
      destinationUrl: destination,
      disclosureRequired: programType !== "normal",
    },
    merchant: selected.merchant,
    title: selected.title,
    priceJpy: selected.price_jpy,
    disclosureText: programType === "normal" ? null : selected.disclosure_text,
  };
}

async function loadRows(env: PersistenceEnv, offerIds: readonly string[]): Promise<CommercialRow[]> {
  const db = env.DB;
  if (!db || offerIds.length === 0) return [];
  const placeholders = offerIds.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT
      mo.id AS offer_id,
      mo.merchant,
      mo.title,
      mo.price_jpy,
      mo.product_url,
      cp.program_type,
      cp.status AS program_status,
      al.destination_url,
      cp.disclosure_text
    FROM merchant_offers mo
    LEFT JOIN attribution_links al ON al.offer_id = mo.id
    LEFT JOIN commercial_programs cp ON cp.id = al.program_id
    WHERE mo.id IN (${placeholders})
      AND (mo.expires_at IS NULL OR mo.expires_at >= CURRENT_TIMESTAMP)
  `).bind(...offerIds).all<CommercialRow>();
  return result.results ?? [];
}

/**
 * Ranking must already be frozen before this function is called. Only offer IDs, ranks and
 * evaluation scores cross this boundary; commission fields are never accepted as ranking input.
 */
export async function resolveCommercialPresentations(args: {
  env: PersistenceEnv;
  ranked: readonly RankedOffer[];
}): Promise<CommercialPresentation[]> {
  if (!args.env.DB || args.ranked.length === 0) return [];
  const rows = await loadRows(args.env, args.ranked.map((item) => item.offerId));
  const grouped = new Map<string, CommercialRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.offer_id) ?? [];
    current.push(row);
    grouped.set(row.offer_id, current);
  }

  const metadata = new Map<string, CommercialOfferMetadata>();
  const display = new Map<string, ReturnType<typeof commercialChoice>>();
  for (const ranked of args.ranked) {
    const choice = commercialChoice(grouped.get(ranked.offerId) ?? []);
    if (!choice) continue;
    metadata.set(ranked.offerId, choice.metadata);
    display.set(ranked.offerId, choice);
  }

  return attachCommercialMetadata(args.ranked, metadata).flatMap((resolved) => {
    const choice = display.get(resolved.offerId);
    if (!choice) return [];
    return [{
      offerId: resolved.offerId,
      rank: resolved.rank,
      evaluationScore: resolved.evaluationScore,
      merchant: choice.merchant,
      title: choice.title,
      priceJpy: choice.priceJpy,
      merchantType: resolved.merchantType,
      disclosureRequired: resolved.disclosureRequired,
      disclosureText: choice.disclosureText,
      outboundPath: `/api/v1/outbound/${encodeURIComponent(resolved.offerId)}`,
    }];
  });
}

export async function resolveOutboundDestination(env: PersistenceEnv, offerId: string): Promise<OutboundDestination | null> {
  const rows = await loadRows(env, [offerId]);
  const choice = commercialChoice(rows);
  if (!choice) return null;
  return {
    offerId,
    merchant: choice.merchant,
    merchantType: choice.metadata.merchantType,
    destinationUrl: choice.metadata.destinationUrl,
  };
}

export async function persistOutboundClick(args: {
  env: PersistenceEnv;
  sessionId: string | null;
  evaluationId?: string | null;
  destination: OutboundDestination;
}): Promise<string | null> {
  const db = args.env.DB;
  if (!db) return null;
  const id = crypto.randomUUID();
  try {
    await db.prepare(`
      INSERT INTO outbound_clicks (id, session_id, evaluation_id, offer_id, merchant_type, merchant)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      args.sessionId,
      args.evaluationId ?? null,
      args.destination.offerId,
      args.destination.merchantType,
      args.destination.merchant,
    ).run();
    return id;
  } catch (error) {
    console.error(JSON.stringify({
      event: "persistence_error",
      operation: "outbound_click",
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}
