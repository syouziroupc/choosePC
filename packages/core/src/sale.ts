import type { MarketEstimate, NormalizedPC } from "./types";
import { marketConfidence } from "./scoring";

export type SaleDecision = "sellable" | "compare_quotes" | "repair_then_sell" | "recycle_or_parts" | "insufficient_data";
export interface SaleAssessment { decision: SaleDecision; market?: { fairPriceJpy: number; lowPriceJpy?: number; highPriceJpy?: number; sampleCount: number; confidence: number }; reasons: string[] }

/** Sale assessment does not invent a dealer buyback price. */
export function assessSale(pc: NormalizedPC, market?: MarketEstimate | null): SaleAssessment {
  if (!market || market.fairPriceJpy <= 0 || market.source === "user_estimate" || market.sampleCount < 3) return { decision: "insufficient_data", reasons: ["売却相場の根拠データが不足しています。"] };
  const confidence = marketConfidence(market);
  const resultMarket = { fairPriceJpy: market.fairPriceJpy, lowPriceJpy: market.lowPriceJpy, highPriceJpy: market.highPriceJpy, sampleCount: market.sampleCount, confidence };
  if (confidence < 55) return { decision: "compare_quotes", market: resultMarket, reasons: ["相場データの確度が低いため、複数の査定・販売価格を比較してください。"] };
  if ((pc.condition.defects?.length ?? 0) > 0) return { decision: "repair_then_sell", market: resultMarket, reasons: ["不具合が売却額に影響するため、修理費と現状査定を比較する価値があります。"] };
  if (market.fairPriceJpy < 3000) return { decision: "recycle_or_parts", market: resultMarket, reasons: ["本体価値が小さいため、部品価値や適正回収も比較対象です。"] };
  return { decision: "sellable", market: resultMarket, reasons: ["一定の中古価値が確認できます。実際の買取額は業者査定と比較してください。"] };
}
