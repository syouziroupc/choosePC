import type { PersistenceEnv } from "./persistence";

export type ConversionStatus = "pending" | "approved" | "rejected" | "cancelled" | "refunded";

export interface ConversionInput {
  provider: string;
  externalReference: string;
  outboundClickId?: string | null;
  occurredAt: string;
  orderValueJpy?: number | null;
  commissionJpy?: number | null;
  status: ConversionStatus;
  metadata?: Record<string, unknown> | null;
}

export interface StoredConversion {
  id: string;
  attributed: boolean;
  outboundClickId: string | null;
  programId: string | null;
  offerId: string | null;
}

type ClickRow = {
  id: string;
  program_id: string | null;
  offer_id: string | null;
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeMetadata(value?: Record<string, unknown> | null): string | null {
  if (value == null) return null;
  const encoded = JSON.stringify(value);
  if (new TextEncoder().encode(encoded).byteLength > 8192) throw new Error("CONVERSION_METADATA_TOO_LARGE");
  return encoded;
}

async function resolveClick(db: D1Database, clickId?: string | null): Promise<ClickRow | null> {
  if (!clickId) return null;
  const row = await db.prepare(`
    SELECT id, program_id, offer_id
    FROM outbound_clicks
    WHERE id = ?
    LIMIT 1
  `).bind(clickId).first<ClickRow>();
  if (!row) throw new Error("CONVERSION_CLICK_NOT_FOUND");
  return row;
}

export async function upsertConversion(args: {
  env: PersistenceEnv;
  conversion: ConversionInput;
}): Promise<StoredConversion> {
  const db = args.env.DB;
  if (!db) throw new Error("CONVERSION_DB_UNAVAILABLE");

  const click = await resolveClick(db, args.conversion.outboundClickId);
  const provider = args.conversion.provider.trim().toLowerCase();
  const externalReference = args.conversion.externalReference.trim();
  const id = `conversion-${(await sha256Hex(`${provider}\n${externalReference}`)).slice(0, 40)}`;
  const metadata = safeMetadata(args.conversion.metadata);

  await db.prepare(`
    INSERT INTO conversion_events (
      id, provider, external_reference, outbound_click_id, gross_order_jpy,
      commission_jpy, status, occurred_at, program_id, offer_id, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      outbound_click_id = excluded.outbound_click_id,
      gross_order_jpy = excluded.gross_order_jpy,
      commission_jpy = excluded.commission_jpy,
      status = excluded.status,
      occurred_at = excluded.occurred_at,
      program_id = excluded.program_id,
      offer_id = excluded.offer_id,
      metadata_json = excluded.metadata_json
  `).bind(
    id,
    provider,
    externalReference,
    click?.id ?? null,
    args.conversion.orderValueJpy ?? null,
    args.conversion.commissionJpy ?? null,
    args.conversion.status,
    args.conversion.occurredAt,
    click?.program_id ?? null,
    click?.offer_id ?? null,
    metadata,
  ).run();

  return {
    id,
    attributed: Boolean(click),
    outboundClickId: click?.id ?? null,
    programId: click?.program_id ?? null,
    offerId: click?.offer_id ?? null,
  };
}
