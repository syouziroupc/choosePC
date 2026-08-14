import type { MarketEstimate, NormalizedPC } from "./types";
import { marketConfidence } from "./scoring";

export type SaleDecision = "sellable" | "compare_quotes" | "repair_then_sell" | "recycle_or_parts" | "insufficient_data";
export interface SaleAssessment { decision: SaleDecision; route: SaleDecision; confidence: number; market?: { fairPriceJpy: number; lowPriceJpy?: number; highPriceJpy?: number; sampleCount: number; confidence: number }; reasons: string[]; }
function result(decision: SaleDecision, confidence: number, reasons: string[], market?: SaleAssessment["market"]): SaleAssessment { return { decision, route: decision, confidence, market, reasons }; }

/** Sale assessment exposes observed market evidence, but never invents a dealer buyback price. */
export function assessSale(pc: NormalizedPC, market?: MarketEstimate | null): SaleAssessment {
  if (!market || market.fairPriceJpy <= 0 || market.source === "user_estimate" || market.sampleCount < 1) return result("insufficient_data", 0, ["売却相場の根拠データがありません。"]);
  const confidence = marketConfidence(market);
  const resultMarket = { fairPriceJpy: market.fairPriceJpy, lowPriceJpy: market.lowPriceJpy, highPriceJpy: market.highPriceJpy, sampleCount: market.sampleCount, confidence };
  if (market.sampleCount < 3) return result("compare_quotes", confidence, [`有効な相場観測が${market.sampleCount}件のため、表示額は参考レンジです。実売・査定価格を追加で比較してください。`], resultMarket);
  if (confidence < 55) return result("compare_quotes", confidence, ["相場データの確度が低いため、複数の査定・販売価格を比較してください。"], resultMarket);
  if ((pc.condition.defects?.length ?? 0) > 0) return result("repair_then_sell", confidence, ["不具合が売却額に影響するため、修理費と現状査定を比較する価値があります。"], resultMarket);
  if (market.fairPriceJpy < 3000) return result("recycle_or_parts", confidence, ["本体価値が小さいため、部品価値や適正回収も比較対象です。"], resultMarket);
  return result("sellable", confidence, ["一定の中古価値が確認できます。実際の買取額は業者査定と比較してください。"], resultMarket);
}
