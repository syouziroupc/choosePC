import type { MerchantType } from "../../../packages/core/src/index";
import type { PersistenceEnv } from "./persistence";

export type CommercialProgramStatus = "active" | "paused" | "unknown";

export interface CommercialProgramInput {
  key: string;
  merchant: string;
  programType: MerchantType;
  status: CommercialProgramStatus;
  commissionMetadata?: Record<string, unknown> | null;
  disclosureText?: string | null;
  sourceUrl?: string | null;
  lastVerifiedAt?: string | null;
  clickRefParam?: string | null;
}

export interface CommercialLinkInput {
  offerId: string;
  destinationUrl: string;
}

export interface StoredCommercialConfiguration {
  programId: string;
  linkIds: string[];
  linkedOfferIds: string[];
}

type OfferMerchantRow = { merchant: string };

function normalizeMerchant(value: string): string {
  return value.trim().toLowerCase();
}

function safeHttpsUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("INVALID_COMMERCIAL_URL");
  url.hash = "";
  return url.toString();
}

function safeClickRefParam(value?: string | null): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(normalized)) throw new Error("INVALID_CLICK_REF_PARAM");
  return normalized;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function commissionJson(value?: Record<string, unknown> | null): string | null {
  if (value == null) return null;
  const encoded = JSON.stringify(value);
  if (new TextEncoder().encode(encoded).byteLength > 4096) throw new Error("COMMISSION_METADATA_TOO_LARGE");
  return encoded;
}

async function assertOfferMerchant(db: D1Database, offerId: string, expectedMerchant: string): Promise<void> {
  const row = await db.prepare("SELECT merchant FROM merchant_offers WHERE id = ? LIMIT 1")
    .bind(offerId)
    .first<OfferMerchantRow>();
  if (!row) throw new Error("COMMERCIAL_OFFER_NOT_FOUND");
  if (normalizeMerchant(row.merchant) !== normalizeMerchant(expectedMerchant)) {
    throw new Error("COMMERCIAL_MERCHANT_MISMATCH");
  }
}

/**
 * Writes only post-ranking commercial configuration. This module is not imported by the neutral
 * offer loader or evaluation packages and therefore cannot supply commission data to ranking.
 */
export async function upsertCommercialConfiguration(args: {
  env: PersistenceEnv;
  program: CommercialProgramInput;
  links: readonly CommercialLinkInput[];
}): Promise<StoredCommercialConfiguration> {
  const db = args.env.DB;
  if (!db) throw new Error("COMMERCIAL_DB_UNAVAILABLE");

  for (const link of args.links) await assertOfferMerchant(db, link.offerId, args.program.merchant);

  const normalizedMerchant = normalizeMerchant(args.program.merchant);
  const normalizedKey = args.program.key.trim().toLowerCase();
  const programId = `program-${(await sha256Hex(`${normalizedMerchant}\n${args.program.programType}\n${normalizedKey}`)).slice(0, 40)}`;
  const sourceUrl = args.program.sourceUrl ? safeHttpsUrl(args.program.sourceUrl) : null;
  const commission = commissionJson(args.program.commissionMetadata);
  const clickRefParam = safeClickRefParam(args.program.clickRefParam);

  await db.prepare(`
    INSERT INTO commercial_programs (
      id, merchant, program_type, status, commission_json, disclosure_text,
      source_url, last_verified_at, click_ref_param, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      merchant = excluded.merchant,
      program_type = excluded.program_type,
      status = excluded.status,
      commission_json = excluded.commission_json,
      disclosure_text = excluded.disclosure_text,
      source_url = excluded.source_url,
      last_verified_at = excluded.last_verified_at,
      click_ref_param = excluded.click_ref_param,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    programId,
    args.program.merchant.trim(),
    args.program.programType,
    args.program.status,
    commission,
    args.program.disclosureText?.trim() || null,
    sourceUrl,
    args.program.lastVerifiedAt ?? null,
    clickRefParam,
  ).run();

  const linkIds: string[] = [];
  for (const link of args.links) {
    const destinationUrl = safeHttpsUrl(link.destinationUrl);
    const linkId = `attr-${(await sha256Hex(`${link.offerId}\n${programId}`)).slice(0, 40)}`;
    await db.prepare("DELETE FROM attribution_links WHERE offer_id = ? AND program_id = ? AND id <> ?")
      .bind(link.offerId, programId, linkId)
      .run();
    await db.prepare(`
      INSERT INTO attribution_links (id, offer_id, program_id, destination_url)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        offer_id = excluded.offer_id,
        program_id = excluded.program_id,
        destination_url = excluded.destination_url
    `).bind(linkId, link.offerId, programId, destinationUrl).run();
    linkIds.push(linkId);
  }

  return {
    programId,
    linkIds,
    linkedOfferIds: args.links.map((link) => link.offerId),
  };
}
