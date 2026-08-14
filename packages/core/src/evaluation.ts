import type { Decision, EvaluationInput, EvaluationResult, HardConstraint, ReasonDetail, ScoreVector } from "./types";
import { clamp, extractMetric, marketConfidence, scoreMarketValue, scoreRequirement } from "./scoring";

export const ENGINE_VERSION = "0.2.1";

const metricLabels: Record<string, string> = {
  cpuGeneral: "CPUの総合性能",
  cpuSingle: "CPUのシングル性能",
  cpuMulti: "CPUのマルチ性能",
  cpuGaming: "CPUのゲーム性能",
  gpu1080: "GPUの1080p性能",
  gpu1440: "GPUの1440p性能",
  gpu4k: "GPUの4K性能",
  gpuCompute: "GPUの演算性能",
  ramGb: "メモリ容量",
  storageGb: "ストレージ容量",
  vramGb: "VRAM容量",
  refreshHz: "画面リフレッシュレート",
  batteryHealthPct: "バッテリー健康度",
  weightKg: "本体重量",
};

function metricLabel(metric: string): string {
  return metricLabels[metric] ?? "この項目";
}

function weightedAverage(values: Array<{ value: number; weight: number }>, fallback = 50): number {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return fallback;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function isGamingCategory(category: string): boolean {
  return ["gaming_laptop", "gaming_desktop", "bto_desktop", "custom_desktop"].includes(category);
}

function isDesktopPowerRelevant(category: string): boolean {
  return ["gaming_desktop", "bto_desktop", "custom_desktop", "workstation"].includes(category);
}

function scoreHardware(input: EvaluationInput): number {
  const { pc, hardware } = input;
  const cpu = hardware.cpu?.general ?? 35;
  const gpu = hardware.gpu?.gaming1080 ?? (pc.gpu?.variant === "integrated" ? 25 : 35);
  const ram = clamp(((pc.memory?.sizeGb ?? 8) / 32) * 100);
  const storage = clamp(((pc.storage?.reduce((sum, item) => sum + (item.sizeGb ?? 0), 0) ?? 256) / 1024) * 100);
  const cooling = pc.extra?.coolingScore ?? 55;
  if (isGamingCategory(pc.category)) {
    return weightedAverage([
      { value: hardware.cpu?.gaming ?? cpu, weight: 0.24 },
      { value: gpu, weight: 0.42 },
      { value: ram, weight: 0.12 },
      { value: storage, weight: 0.08 },
      { value: cooling, weight: 0.14 },
    ]);
  }
  return weightedAverage([
    { value: cpu, weight: 0.46 },
    { value: ram, weight: 0.24 },
    { value: storage, weight: 0.16 },
    { value: pc.extra?.upgradeabilityScore ?? 60, weight: 0.14 },
  ]);
}

function scoreCondition(input: EvaluationInput): number {
  const { pc } = input;
  if (pc.condition.type === "new") return 96;
  const base = pc.condition.type === "refurbished" ? 84 : pc.condition.type === "used" ? 74 : 60;
  const gradeAdjustment: Record<string, number> = { S: 12, A: 8, B: 2, C: -10, D: -25, unknown: 0 };
  let result = base + gradeAdjustment[pc.condition.grade ?? "unknown"];
  const battery = pc.condition.batteryHealthPct;
  if (battery != null && (pc.category.includes("laptop") || pc.category === "mac")) {
    result += battery >= 85 ? 5 : battery >= 70 ? 0 : battery >= 55 ? -8 : -18;
  }
  result -= Math.min(30, (pc.condition.defects?.length ?? 0) * 8);
  if ((pc.commerce.warrantyDays ?? 0) >= 90) result += 4;
  if ((pc.commerce.warrantyDays ?? 0) === 0) result -= 4;
  return clamp(result);
}

function scoreLongevity(input: EvaluationInput, fit: number): number {
  const { pc } = input;
  const upgrade = pc.extra?.upgradeabilityScore ?? 55;
  const age = pc.extra?.platformAgeYears;
  const supportYears = pc.extra?.osSupportYears;
  const ageScore = age == null ? 60 : clamp(100 - Math.max(0, age - 1) * 8);
  const supportScore = supportYears == null ? 60 : clamp(45 + supportYears * 10);
  const memoryHeadroom = clamp(((pc.memory?.sizeGb ?? 8) / 32) * 100);
  return weightedAverage([
    { value: fit, weight: 0.35 },
    { value: upgrade, weight: 0.22 },
    { value: ageScore, weight: 0.18 },
    { value: supportScore, weight: 0.15 },
    { value: memoryHeadroom, weight: 0.10 },
  ]);
}

function deriveRisk(input: EvaluationInput, constraints: HardConstraint[]): number {
  const { pc } = input;
  let risk = 8;
  if (constraints.some((c) => c.severity === "critical" && c.known)) risk += 80;
  risk += constraints.filter((c) => c.severity === "warning" && c.known).length * 8;
  if ((pc.condition.batteryHealthPct ?? 100) < 55) risk += 18;
  if ((pc.condition.defects?.length ?? 0) > 0) risk += Math.min(24, (pc.condition.defects?.length ?? 0) * 8);
  if (pc.extra?.psuWatts && pc.extra?.recommendedPsuWatts && pc.extra.psuWatts < pc.extra.recommendedPsuWatts) risk += 55;
  if (pc.category === "gaming_laptop" && pc.gpu?.variant === "laptop" && pc.gpu.tgpW == null) risk += 8;
  if (isGamingCategory(pc.category) && pc.extra?.coolingScore == null) risk += 5;
  if (isDesktopPowerRelevant(pc.category) && (pc.extra?.psuWatts == null || pc.extra?.recommendedPsuWatts == null)) risk += 5;
  if (pc.condition.type === "used" && (pc.commerce.warrantyDays ?? 0) === 0) risk += 5;
  return clamp(risk);
}

function deriveConfidence(input: EvaluationInput, essentialKnown: number, essentialTotal: number): number {
  const { pc, hardware, market } = input;
  const essentialCoverage = essentialTotal === 0 ? 100 : (essentialKnown / essentialTotal) * 100;
  const needsGpu = input.profile.requirements.some((r) => r.metric.startsWith("gpu") || r.metric === "vramGb");
  const gpuEvidence = needsGpu ? hardware.gpuConfidence : 100;
  const gamingEvidence = isGamingCategory(pc.category)
    ? weightedAverage([
        { value: pc.extra?.coolingScore == null ? 45 : 100, weight: 0.55 },
        { value: pc.category === "gaming_laptop" && pc.gpu?.variant === "laptop" ? (pc.gpu.tgpW == null ? 45 : 100) : 100, weight: 0.45 },
      ])
    : 100;
  const powerEvidence = isDesktopPowerRelevant(pc.category)
    ? (pc.extra?.psuWatts != null && pc.extra?.recommendedPsuWatts != null ? 100 : 50)
    : 100;
  const context = input.context ?? "purchase";
  const coreEvidence = context === "ownership"
    ? weightedAverage([
        { value: hardware.cpuConfidence, weight: 0.31 },
        { value: gpuEvidence, weight: 0.22 },
        { value: essentialCoverage, weight: 0.29 },
        { value: gamingEvidence, weight: 0.10 },
        { value: powerEvidence, weight: 0.08 },
      ])
    : weightedAverage([
        { value: hardware.cpuConfidence, weight: 0.23 },
        { value: gpuEvidence, weight: 0.18 },
        { value: pc.commerce.priceJpy != null ? 100 : 30, weight: 0.12 },
        { value: marketConfidence(market), weight: 0.16 },
        { value: essentialCoverage, weight: 0.17 },
        { value: gamingEvidence, weight: 0.08 },
        { value: powerEvidence, weight: 0.06 },
      ]);
  const criticalEvidence = Math.min(hardware.cpuConfidence, gpuEvidence);
  return clamp(Math.min(coreEvidence, criticalEvidence + 5));
}

export function aggregateScore(scores: ScoreVector): number {
  const base = scores.hardware * 0.16 + scores.fit * 0.34 + scores.value * 0.24 + scores.condition * 0.08 + scores.longevity * 0.18;
  return clamp(base - Math.max(0, scores.risk - 20) * 0.38 - Math.max(0, 70 - scores.confidence) * 0.20);
}

export function decide(scores: ScoreVector, constraints: HardConstraint[] = []): Decision {
  if (constraints.some((x) => x.severity === "critical" && x.known)) return "avoid";
  if (constraints.some((x) => x.severity === "critical" && !x.known) || scores.confidence < 58) return "insufficient_data";
  if (scores.risk >= 70 || scores.fit < 45) return "avoid";
  if (scores.value < 38 && scores.fit >= 65) return "overpriced";
  const overall = aggregateScore(scores);
  if (overall >= 87 && scores.fit >= 85 && scores.value >= 72 && scores.risk <= 25 && scores.confidence >= 78) return "strong_buy";
  if (overall >= 74 && scores.fit >= 75 && scores.value >= 55 && scores.risk <= 45 && scores.confidence >= 68) return "buy";
  if (scores.fit >= 60 && scores.value >= 42 && scores.risk < 60) return "fair";
  if (scores.fit >= 60 && scores.value < 42) return "overpriced";
  return "avoid";
}

function applyMarketTrustGate(decision: Decision, input: EvaluationInput, warnings: string[]): Decision {
  if ((input.context ?? "purchase") !== "purchase" || decision !== "strong_buy") return decision;
  if (input.market?.source === "observed_market") return decision;
  warnings.push("実売相場の観測データがないため、入力された比較相場だけでは最上位の購入推奨にはしません。");
  return "buy";
}

export function evaluatePc(input: EvaluationInput): EvaluationResult {
  const reasons: ReasonDetail[] = [];
  const warnings: string[] = [];
  const constraints: HardConstraint[] = [];
  const fitParts: Array<{ value: number; weight: number }> = [];
  let essentialKnown = 0;
  let essentialTotal = 0;

  for (const req of input.profile.requirements) {
    const actual = extractMetric(req.metric, input.pc, input.hardware);
    const label = metricLabel(req.metric);
    if (req.essential) essentialTotal += 1;
    if (actual == null) {
      const policy = req.unknownPolicy ?? (req.essential ? "block" : "warn");
      if (policy === "block") constraints.push({ code: `missing:${req.metric}`, severity: "critical", known: false, message: `${label}が未入力、または判定用データがありません` });
      else if (policy === "warn") warnings.push(`${label}を確認できないため、この項目は判定材料が少なくなっています。`);
      continue;
    }
    if (req.essential) essentialKnown += 1;
    fitParts.push({ value: scoreRequirement(actual, req), weight: req.weight });
    const fails = req.direction === "lower_is_better" ? actual > req.minimum : actual < req.minimum;
    const preferred = req.direction === "lower_is_better" ? actual <= req.preferred : actual >= req.preferred;
    if (fails) {
      reasons.push({ code: `below_min:${req.metric}`, kind: req.essential ? "critical" : "warning", message: `${label}がこの用途の最低目安に届いていません`, metric: req.metric, actual, minimum: req.minimum, preferred: req.preferred });
      if (req.essential) constraints.push({ code: `below_min:${req.metric}`, severity: "critical", known: true, message: `${label}がこの用途の必須条件を満たしていません` });
    } else if (preferred) {
      reasons.push({ code: `preferred:${req.metric}`, kind: "positive", message: `${label}はこの用途の推奨目安を満たしています`, metric: req.metric, actual, minimum: req.minimum, preferred: req.preferred });
    } else {
      reasons.push({ code: `acceptable:${req.metric}`, kind: "neutral", message: `${label}はこの用途で使える範囲です`, metric: req.metric, actual, minimum: req.minimum, preferred: req.preferred });
    }
  }

  if (input.pc.category === "gaming_laptop" && input.pc.gpu?.variant === "laptop" && input.pc.gpu.tgpW == null) {
    warnings.push("ゲーミングノートは同じGPU名でもTGPで性能が変わります。TGPが分からないため、余裕を見て判定しています。");
    constraints.push({ code: "gaming_laptop:tgp_unknown", severity: "warning", known: true, message: "GPU TGPが不明です" });
  }
  if (isGamingCategory(input.pc.category) && input.pc.extra?.coolingScore == null) {
    warnings.push("冷却性能のデータがないため、長時間負荷時の性能には余裕を見て判定しています。");
    constraints.push({ code: "gaming:cooling_unknown", severity: "warning", known: true, message: "冷却性能が不明です" });
  }
  if (input.pc.extra?.psuWatts && input.pc.extra?.recommendedPsuWatts && input.pc.extra.psuWatts < input.pc.extra.recommendedPsuWatts) {
    constraints.push({ code: "desktop:psu_insufficient", severity: "critical", known: true, message: "電源容量が必要目安を下回っています" });
  } else if (isDesktopPowerRelevant(input.pc.category) && (input.pc.extra?.psuWatts == null || input.pc.extra?.recommendedPsuWatts == null)) {
    warnings.push("電源容量を確認できないため、デスクトップPCでは購入前に電源ユニットの容量確認が必要です。");
    constraints.push({ code: "desktop:psu_unknown", severity: "warning", known: true, message: "電源情報が不明です" });
  }

  const fit = clamp(weightedAverage(fitParts, 45));
  const value = scoreMarketValue(input.pc.commerce.priceJpy, input.market);
  const condition = scoreCondition(input);
  const hardware = clamp(scoreHardware(input));
  const longevity = clamp(scoreLongevity(input, fit));
  const risk = deriveRisk(input, constraints);
  const confidence = deriveConfidence(input, essentialKnown, essentialTotal);
  const scores: ScoreVector = { hardware, fit, value, condition, longevity, risk, confidence };

  if (!input.market && (input.context ?? "purchase") === "purchase") warnings.push("比較できる相場データがないため、販売価格は良い・悪いのどちらにも判定していません。");
  if (input.market?.source === "user_estimate") warnings.push("比較相場は入力された参考価格です。実売データとは別に扱っています。");
  if (value >= 85) reasons.push({ code: "value:good", kind: "positive", message: "入力された比較相場に対して販売価格は安めです" });
  if (value < 45) reasons.push({ code: "value:poor", kind: "warning", message: "入力された比較相場に対して販売価格が高めです" });

  const decision = applyMarketTrustGate(decide(scores, constraints), input, warnings);
  return {
    scores: { ...scores, overall: aggregateScore(scores) },
    decision,
    reasons: reasons.map((r) => r.code),
    reasonDetails: reasons,
    warnings,
    constraints,
    engineVersion: input.engineVersion ?? ENGINE_VERSION,
    knowledgeVersion: input.knowledgeVersion ?? "dev",
  };
}

export function buildEvaluationResult(args: { scores: ScoreVector; constraints?: HardConstraint[]; reasons?: string[]; warnings?: string[]; engineVersion: string; knowledgeVersion: string }): EvaluationResult {
  return {
    scores: { ...args.scores, overall: aggregateScore(args.scores) },
    decision: decide(args.scores, args.constraints ?? []),
    reasons: args.reasons ?? [],
    reasonDetails: [],
    warnings: args.warnings ?? [],
    constraints: args.constraints ?? [],
    engineVersion: args.engineVersion,
    knowledgeVersion: args.knowledgeVersion,
  };
}
