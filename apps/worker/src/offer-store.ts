import {
  createProductSignature,
  resolveHardware,
  type NormalizedPC,
} from "../../../packages/core/src/index";
import type { PersistenceEnv } from "./persistence";

export const OFFER_MAX_AGE_DAYS = 30;
export const OFFER_MAX_AGE_MS = OFFER_MAX_AGE_DAYS * 86_400_000;

export type OfferStockState = "in_stock" | "low_stock" | "out_of_stock" | "sold" | "unavailable" | "unknown";

export interface TrustedMerchantOffer {
  merchant: string;
  title: string;
  priceJpy: number;
  productUrl: string;
  stockState: OfferStockState;
  pc: NormalizedPC;
  observedAt: string;
  expiresAt?: string | null;
}

export interface StoredMerchantOffer {
  id: string;
  productSignature: string;
  created: boolean;
  expiresAt: string;
}

function normalizeHttpsUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("INVALID_OFFER_URL");
  url.hash = "";
  return url.toString();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function productSignature(pc: NormalizedPC): string {
  const hardware = resolveHardware(pc.cpu?.raw, pc.gpu?.raw, pc.gpu?.tgpW, {
    cpuConfidence: pc.cpu?.confidence,
    gpuConfidence: pc.gpu?.confidence,
  });
  return createProductSignature(pc, hardware).key;
}

function canonicalPc(pc: NormalizedPC, priceJpy: number): NormalizedPC {
  return {
    ...pc,
    commerce: {
      ...pc.commerce,
      priceJpy,
    },
  };
}

function effectiveExpiry(observedAt: string, requestedExpiresAt?: string | null): string {
  const observedMs = new Date(observedAt).getTime();
  if (!Number.isFinite(observedMs)) throw new Error("INVALID_OFFER_OBSERVED_AT");
  const maximumMs = observedMs + OFFER_MAX_AGE_MS;
  if (requestedExpiresAt == null) return new Date(maximumMs).toISOString();

  const requestedMs = new Date(requestedExpiresAt).getTime();
  if (!Number.isFinite(requestedMs) || requestedMs < observedMs) throw new Error("INVALID_OFFER_EXPIRY");
  return new Date(Math.min(requestedMs, maximumMs)).toISOString();
}

/**
 * Stores neutral offer facts only. Affiliate URLs and commission/program metadata are deliberately
 * not accepted here; those belong to the separate post-ranking commercial tables. Every stored
 * offer receives an effective expiry no later than 30 days after its observation timestamp.
 */
export async function upsertTrustedMerchantOffer(args: {
  env: PersistenceEnv;
  offer: TrustedMerchantOffer;
}): Promise<StoredMerchantOffer> {
  const db = args.env.DB;
  if (!db) throw new Error("OFFER_DB_UNAVAILABLE");

  const productUrl = normalizeHttpsUrl(args.offer.productUrl);
  const id = `offer-${(await sha256Hex(`${args.offer.merchant.trim().toLowerCase()}\n${productUrl}`)).slice(0, 40)}`;
  const signature = productSignature(args.offer.pc);
  const pc = canonicalPc(args.offer.pc, Math.round(args.offer.priceJpy));
  const expiresAt = effectiveExpiry(args.offer.observedAt, args.offer.expiresAt);
  const existing = await db.prepare("SELECT id FROM merchant_offers WHERE id = ? LIMIT 1")
    .bind(id)
    .first<{ id: string }>();

  await db.prepare(`
    INSERT INTO merchant_offers (
      id, merchant, title, price_jpy, product_url, affiliate_url, stock_state,
      product_signature, normalized_pc_json, observed_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      merchant = excluded.merchant,
      title = excluded.title,
      price_jpy = excluded.price_jpy,
      product_url = excluded.product_url,
      affiliate_url = NULL,
      stock_state = excluded.stock_state,
      product_signature = excluded.product_signature,
      normalized_pc_json = excluded.normalized_pc_json,
      observed_at = excluded.observed_at,
      expires_at = excluded.expires_at
  `).bind(
    id,
    args.offer.merchant.trim(),
    args.offer.title.trim(),
    Math.round(args.offer.priceJpy),
    productUrl,
    args.offer.stockState,
    signature,
    JSON.stringify(pc),
    args.offer.observedAt,
    expiresAt,
  ).run();

  return { id, productSignature: signature, created: !existing, expiresAt };
}
