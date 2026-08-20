import type { MerchantType } from "../../../packages/core/src/index";
import type { PersistenceEnv } from "./persistence";

export type CommercialProgramStatus = "active" | "paused" | "unknown";
export const PRIMARY_AFFILIATE_NETWORK_ID = "a8" as const;

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
  externalProgramId?: string | null;
}

export interface CommercialLinkInput {
  offerId: string;
  destinationUrl: string;
}

export interface StoredCommercialConfiguration {
  programId: string;
  affiliateNetwork: "a8" | null;
  externalProgramId: string | null;
  linkIds: string[];
  linkedOfferIds: string[];
}

type OfferMerchantRow = { merchant: string };

type PreparedCommercialLink = {
  offerId: string;
  destinationUrl: string;
  linkId: string;
};

function normalizeMerchant(value: string): string {
  return value.trim().toLowerCase();
}

function safeHttpsUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("INVALID_COMMERCIAL_URL");
  url.hash = "";
  return url.toString();
}

function safeClickRefParam(value: string | null | undefined, affiliateNetwork: "a8" | null): string | null {
  if (value == null || value.trim() === "") return null;
  const normalized = value.trim();
  if (affiliateNetwork === PRIMARY_AFFILIATE_NETWORK_ID) {
    if (!/^id[1-5]$/.test(normalized)) throw new Error("INVALID_A8_CLICK_REF_PARAM");
    return normalized;
  }
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(normalized)) throw new Error("INVALID_CLICK_REF_PARAM");
  return normalized;
}

function safeExternalProgramId(value?: string | null): string | null {
  if (value == null || value.trim() === "") return null;
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(normalized)) throw new Error("INVALID_EXTERNAL_PROGRAM_ID");
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

async function prepareLinks(
  db: D1Database,
  programId: string,
  expectedMerchant: string,
  links: readonly CommercialLinkInput[],
): Promise<PreparedCommercialLink[]> {
  const seen = new Set<string>();
  const prepared: PreparedCommercialLink[] = [];
  for (const link of links) {
    if (seen.has(link.offerId)) throw new Error("COMMERCIAL_DUPLICATE_OFFER_LINK");
    seen.add(link.offerId);
    await assertOfferMerchant(db, link.offerId, expectedMerchant);
    prepared.push({
      offerId: link.offerId,
      destinationUrl: safeHttpsUrl(link.destinationUrl),
      linkId: `attr-${(await sha256Hex(`${link.offerId}\n${programId}`)).slice(0, 40)}`,
    });
  }
  return prepared;
}

async function executeStatements(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  const batch = (db as D1Database & { batch?: (items: D1PreparedStatement[]) => Promise<unknown> }).batch;
  if (typeof batch === "function") {
    await batch.call(db, statements);
    return;
  }
  // D1 always exposes batch(). This fallback exists only for minimal test/local adapters.
  for (const statement of statements) await statement.run();
}

/**
 * Writes only post-ranking commercial configuration. This module is not imported by the neutral
 * offer loader or evaluation packages and therefore cannot supply commission data to ranking.
 *
 * All affiliate programs are deliberately bound to A8.net. This keeps one affiliate control plane
 * while still allowing multiple A8 advertisers and product-level destinations.
 */
export async function upsertCommercialConfiguration(args: {
  env: PersistenceEnv;
  program: CommercialProgramInput;
  links: readonly CommercialLinkInput[];
}): Promise<StoredCommercialConfiguration> {
  const db = args.env.DB;
  if (!db) throw new Error("COMMERCIAL_DB_UNAVAILABLE");

  const normalizedMerchant = normalizeMerchant(args.program.merchant);
  const normalizedKey = args.program.key.trim().toLowerCase();
  const programId = `program-${(await sha256Hex(`${normalizedMerchant}\n${args.program.programType}\n${normalizedKey}`)).slice(0, 40)}`;
  const sourceUrl = args.program.sourceUrl ? safeHttpsUrl(args.program.sourceUrl) : null;
  const commission = commissionJson(args.program.commissionMetadata);
  const affiliateNetwork = args.program.programType === "affiliate" ? PRIMARY_AFFILIATE_NETWORK_ID : null;
  const clickRefParam = safeClickRefParam(args.program.clickRefParam, affiliateNetwork);
  const externalProgramId = safeExternalProgramId(args.program.externalProgramId);
  const links = await prepareLinks(db, programId, args.program.merchant, args.links);

  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO commercial_programs (
        id, merchant, program_type, status, commission_json, disclosure_text,
        source_url, last_verified_at, click_ref_param, program_key,
        affiliate_network, external_program_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        merchant = excluded.merchant,
        program_type = excluded.program_type,
        status = excluded.status,
        commission_json = excluded.commission_json,
        disclosure_text = excluded.disclosure_text,
        source_url = excluded.source_url,
        last_verified_at = excluded.last_verified_at,
        click_ref_param = excluded.click_ref_param,
        program_key = excluded.program_key,
        affiliate_network = excluded.affiliate_network,
        external_program_id = excluded.external_program_id,
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
      args.program.key.trim(),
      affiliateNetwork,
      externalProgramId,
    ),
    db.prepare("DELETE FROM attribution_links WHERE program_id = ?").bind(programId),
  ];

  for (const link of links) {
    statements.push(db.prepare(`
      INSERT INTO attribution_links (id, offer_id, program_id, destination_url)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        offer_id = excluded.offer_id,
        program_id = excluded.program_id,
        destination_url = excluded.destination_url
    `).bind(link.linkId, link.offerId, programId, link.destinationUrl));
  }

  await executeStatements(db, statements);

  return {
    programId,
    affiliateNetwork,
    externalProgramId,
    linkIds: links.map((link) => link.linkId),
    linkedOfferIds: links.map((link) => link.offerId),
  };
}
