import type { EvaluationResult, HardConstraint, NormalizedPC } from "./types";

export type ReplacementDecision = "keep" | "upgrade" | "repair_or_inspect" | "replace" | "insufficient_data";
export interface ReplacementResult { decision: ReplacementDecision; urgency: number; reasons: string[] }

function knownCriticalConstraints(result: EvaluationResult): HardConstraint[] {
  return result.constraints.filter((constraint) => constraint.severity === "critical" && constraint.known);
}

function canUpgradeMemory(pc: NormalizedPC): boolean {
  return pc.memory?.upgradeable === true || (pc.extra?.upgradeabilityScore ?? 0) >= 65;
}

export function decideReplacement(pc: NormalizedPC, currentEvaluation: EvaluationResult): ReplacementResult {
  const { scores } = currentEvaluation;
  if (scores.confidence < 58 || currentEvaluation.constraints.some((c) => c.severity === "critical" && !c.known)) {
    return { decision: "insufficient_data", urgency: 40, reasons: ["重要情報が不足しているため、買い替え判断を保留します。"] };
  }

  const critical = knownCriticalConstraints(currentEvaluation);
  if (critical.some((constraint) => constraint.code === "desktop:psu_insufficient")) {
    return {
      decision: "repair_or_inspect",
      urgency: 85,
      reasons: ["電源容量が必要目安を下回っているため、本体更新より先に電源構成の修正・点検が必要です。"],
    };
  }

  if (critical.length > 0) {
    const onlyMemoryCapacity = critical.every((constraint) => constraint.code === "below_min:ramGb");
    if (onlyMemoryCapacity && canUpgradeMemory(pc)) {
      return {
        decision: "upgrade",
        urgency: 55,
        reasons: ["必須条件の不足がメモリ容量に限定され、増設可能性が確認できるため、まずメモリ増設を優先します。"],
      };
    }
    return {
      decision: "replace",
      urgency: 80,
      reasons: ["用途の必須条件を満たさない既知の制約があり、単純なメモリ・ストレージ増設だけでは解消できません。"],
    };
  }

  if ((pc.condition.defects?.length ?? 0) > 0 && scores.fit >= 65) {
    return { decision: "repair_or_inspect", urgency: 55, reasons: ["用途性能は足りていますが、不具合の確認・修理を先に検討できます。"] };
  }
  if (scores.fit >= 78 && scores.risk < 40 && scores.longevity >= 62) {
    return { decision: "keep", urgency: 15, reasons: ["現在の用途には十分な性能があり、直ちに買い替える必要性は低いです。"] };
  }

  const ram = pc.memory?.sizeGb ?? 0;
  const storage = pc.storage?.reduce((sum, item) => sum + (item.sizeGb ?? 0), 0) ?? 0;
  if (scores.fit >= 52 && canUpgradeMemory(pc) && (ram < 16 || storage < 512)) {
    return { decision: "upgrade", urgency: 35, reasons: ["CPU/GPUを含む基礎性能は利用可能で、メモリ・ストレージ増設で延命できる可能性があります。"] };
  }
  return { decision: "replace", urgency: Math.round(Math.min(100, 100 - scores.fit * 0.55 + scores.risk * 0.35)), reasons: ["用途適合度または将来性が低く、部品交換より本体更新を優先すべき状態です。"] };
}
