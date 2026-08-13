import type { EvaluationResult, NormalizedPC } from "./types";

export type ReplacementDecision = "keep" | "upgrade" | "repair_or_inspect" | "replace" | "insufficient_data";
export interface ReplacementResult { decision: ReplacementDecision; urgency: number; reasons: string[] }

export function decideReplacement(pc: NormalizedPC, currentEvaluation: EvaluationResult): ReplacementResult {
  const { scores } = currentEvaluation;
  if (scores.confidence < 58 || currentEvaluation.constraints.some((c) => c.severity === "critical" && !c.known)) return { decision: "insufficient_data", urgency: 40, reasons: ["重要情報が不足しているため、買い替え判断を保留します。"] };
  if ((pc.condition.defects?.length ?? 0) > 0 && scores.fit >= 65) return { decision: "repair_or_inspect", urgency: 55, reasons: ["用途性能は足りていますが、不具合の確認・修理を先に検討できます。"] };
  if (scores.fit >= 78 && scores.risk < 40 && scores.longevity >= 62) return { decision: "keep", urgency: 15, reasons: ["現在の用途には十分な性能があり、直ちに買い替える必要性は低いです。"] };
  const ram = pc.memory?.sizeGb ?? 0;
  const storage = pc.storage?.reduce((sum, item) => sum + (item.sizeGb ?? 0), 0) ?? 0;
  const canUpgrade = pc.memory?.upgradeable === true || (pc.extra?.upgradeabilityScore ?? 0) >= 65;
  if (scores.fit >= 52 && canUpgrade && (ram < 16 || storage < 512)) return { decision: "upgrade", urgency: 35, reasons: ["CPU/GPUを含む基礎性能は利用可能で、メモリ・ストレージ増設で延命できる可能性があります。"] };
  return { decision: "replace", urgency: Math.round(Math.min(100, 100 - scores.fit * 0.55 + scores.risk * 0.35)), reasons: ["用途適合度または将来性が低く、部品交換より本体更新を優先すべき状態です。"] };
}
