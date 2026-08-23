import type {
  Decision,
  EvaluationInput,
  EvaluationResult,
  HardConstraint,
  ReasonDetail,
  ScoreBreakdown,
  ScoreComponentBreakdown,
  ScoreEvidenceStatus,
  ScoreFactor,
  ScoreVector,
} from "./types";
import { clamp, extractMetric, marketConfidence, scoreMarketValue, scoreRequirement } from "./scoring";

export const ENGINE_VERSION = "0.3.0";

const SCORE_WEIGHTS = {
  performance: 25,
  fit: 30,
  price: 20,
  condition: 10,
  longevity: 15,
} as const;

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

function roundScore(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function evidenceStatus(coverage: number, unavailable = false): ScoreEvidenceStatus {
  if (unavailable) return "unavailable";
  if (coverage >= 0.85) return "measured";
  if (coverage > 0) return "estimated";
  return "neutral";
}

function blendUnknown(raw: number, coverage: number, neutral = 50): number {
  return clamp(raw * coverage + neutral * (1 - coverage));
}

function isGamingCategory(category: string): boolean {
  return ["gaming_laptop", "gaming_desktop", "bto_desktop", "custom_desktop"].includes(category);
}

function isDesktopPowerRelevant(category: string): boolean {
  return ["gaming_desktop", "bto_desktop", "custom_desktop", "workstation"].includes(category);
}

type ComponentScore = { score: number; coverage: number; factors: ScoreFactor[] };

function scoreHardware(input: EvaluationInput): ComponentScore {
  const { pc, hardware } = input;
  const ramGb = pc.memory?.sizeGb ?? null;
  const storageGb = pc.storage?.reduce((sum, item) => sum + (item.sizeGb ?? 0), 0) ?? 0;
  const storageKnown = storageGb > 0;
  const gaming = isGamingCategory(pc.category);
  const definitions = gaming
    ? [
        { key: "cpu", label: "CPUゲーム性能", value: hardware.cpu?.gaming ?? hardware.cpu?.general ?? null, weight: 0.24 },
        { key: "gpu", label: "GPU性能", value: hardware.gpu?.gaming1080 ?? null, weight: 0.42 },
        { key: "memory", label: "メモリ容量", value: ramGb == null ? null : clamp((ramGb / 32) * 100), weight: 0.12, actual: ramGb },
        { key: "storage", label: "ストレージ容量", value: storageKnown ? clamp((storageGb / 1024) * 100) : null, weight: 0.08, actual: storageKnown ? storageGb : null },
        { key: "cooling", label: "冷却性能", value: pc.extra?.coolingScore ?? null, weight: 0.14 },
      ]
    : [
        { key: "cpu", label: "CPU総合性能", value: hardware.cpu?.general ?? null, weight: 0.46 },
        { key: "memory", label: "メモリ容量", value: ramGb == null ? null : clamp((ramGb / 32) * 100), weight: 0.24, actual: ramGb },
        { key: "storage", label: "ストレージ容量", value: storageKnown ? clamp((storageGb / 1024) * 100) : null, weight: 0.16, actual: storageKnown ? storageGb : null },
        { key: "upgradeability", label: "拡張性", value: pc.extra?.upgradeabilityScore ?? null, weight: 0.14 },
      ];
  const known = definitions.filter((item) => item.value != null) as Array<(typeof definitions)[number] & { value: number }>;
  const coverage = clamp(known.reduce((sum, item) => sum + item.weight, 0), 0, 1);
  const raw = weightedAverage(known.map((item) => ({ value: item.value, weight: item.weight })), 50);
  const factors: ScoreFactor[] = definitions.map((item) => ({
    key: item.key,
    label: item.label,
    score: item.value == null ? null : roundScore(item.value),
    weight: item.weight,
    coverage: item.value == null ? 0 : 1,
    status: item.value == null ? "unavailable" : "measured",
    actual: "actual" in item ? item.actual : undefined,
  }));
  return { score: blendUnknown(raw, coverage), coverage, factors };
}

function scoreCondition(input: EvaluationInput): ComponentScore {
  const { pc } = input;
  if (pc.condition.type === "new") return {
    score: 96,
    coverage: 1,
    factors: [{ key: "condition_type", label: "商品状態", score: 96, weight: 1, coverage: 1, status: "measured" }],
  };
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
  const laptop = pc.category.includes("laptop") || pc.category === "mac";
  const coverageParts = [
    { known: pc.condition.type !== "unknown", weight: 0.45 },
    { known: pc.condition.grade != null && pc.condition.grade !== "unknown", weight: 0.15 },
    { known: !laptop || battery != null, weight: 0.15 },
    { known: pc.commerce.warrantyDays != null, weight: 0.10 },
    { known: Array.isArray(pc.condition.defects), weight: 0.15 },
  ];
  const coverage = coverageParts.reduce((sum, item) => sum + (item.known ? item.weight : 0), 0);
  return {
    score: blendUnknown(clamp(result), coverage, 60),
    coverage,
    factors: [
      { key: "condition_type", label: "商品状態", score: pc.condition.type === "unknown" ? null : base, weight: 0.45, coverage: pc.condition.type === "unknown" ? 0 : 1, status: pc.condition.type === "unknown" ? "unavailable" : "measured" },
      { key: "grade", label: "外観ランク", score: pc.condition.grade == null || pc.condition.grade === "unknown" ? null : clamp(base + gradeAdjustment[pc.condition.grade]), weight: 0.15, coverage: pc.condition.grade == null || pc.condition.grade === "unknown" ? 0 : 1, status: pc.condition.grade == null || pc.condition.grade === "unknown" ? "unavailable" : "measured" },
      { key: "battery", label: "バッテリー状態", score: !laptop || battery == null ? null : battery, weight: 0.15, coverage: !laptop || battery == null ? 0 : 1, status: !laptop || battery == null ? "unavailable" : "measured", actual: battery },
      { key: "warranty", label: "保証", score: pc.commerce.warrantyDays == null ? null : clamp(45 + Math.min(55, pc.commerce.warrantyDays / 3)), weight: 0.10, coverage: pc.commerce.warrantyDays == null ? 0 : 1, status: pc.commerce.warrantyDays == null ? "unavailable" : "measured", actual: pc.commerce.warrantyDays },
      { key: "defects", label: "申告された不具合", score: !Array.isArray(pc.condition.defects) ? null : clamp(100 - pc.condition.defects.length * 20), weight: 0.15, coverage: Array.isArray(pc.condition.defects) ? 1 : 0, status: Array.isArray(pc.condition.defects) ? "measured" : "unavailable" },
    ],
  };
}

function scoreLongevity(input: EvaluationInput, fit: number, fitCoverage: number): ComponentScore {
  const { pc } = input;
  const upgrade = pc.extra?.upgradeabilityScore ?? 55;
  const age = pc.extra?.platformAgeYears;
  const supportYears = pc.extra?.osSupportYears;
  const ageScore = age == null ? 60 : clamp(100 - Math.max(0, age - 1) * 8);
  const supportScore = supportYears == null ? 60 : clamp(45 + supportYears * 10);
  const memoryHeadroom = clamp(((pc.memory?.sizeGb ?? 8) / 32) * 100);
  const definitions = [
    { key: "fit_headroom", label: "用途性能の余裕", value: fit, known: fitCoverage > 0, coverage: fitCoverage, weight: 0.35 },
    { key: "upgradeability", label: "拡張性", value: upgrade, known: pc.extra?.upgradeabilityScore != null, coverage: pc.extra?.upgradeabilityScore != null ? 1 : 0, weight: 0.22 },
    { key: "platform_age", label: "プラットフォーム年齢", value: ageScore, known: age != null, coverage: age != null ? 1 : 0, weight: 0.18 },
    { key: "os_support", label: "OSサポート見込み", value: supportScore, known: supportYears != null, coverage: supportYears != null ? 1 : 0, weight: 0.15 },
    { key: "memory_headroom", label: "メモリの余裕", value: memoryHeadroom, known: pc.memory?.sizeGb != null, coverage: pc.memory?.sizeGb != null ? 1 : 0, weight: 0.10 },
  ];
  const coverage = clamp(definitions.reduce((sum, item) => sum + item.weight * item.coverage, 0), 0, 1);
  const raw = weightedAverage(definitions.filter((item) => item.known).map((item) => ({ value: item.value, weight: item.weight })), 50);
  return {
    score: blendUnknown(raw, coverage),
    coverage,
    factors: definitions.map((item) => ({ key: item.key, label: item.label, score: item.known ? roundScore(item.value) : null, weight: item.weight, coverage: item.coverage, status: item.known ? evidenceStatus(item.coverage) : "unavailable" })),
  };
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
  const base = scores.hardware * SCORE_WEIGHTS.performance / 100
    + scores.fit * SCORE_WEIGHTS.fit / 100
    + scores.value * SCORE_WEIGHTS.price / 100
    + scores.condition * SCORE_WEIGHTS.condition / 100
    + scores.longevity * SCORE_WEIGHTS.longevity / 100;
  return clamp(base - Math.max(0, scores.risk - 20) * 0.38 - Math.max(0, 70 - scores.confidence) * 0.20);
}

function component(args: {
  key: ScoreComponentBreakdown["key"];
  label: string;
  score: number;
  maxPoints: number;
  coverage: number;
  factors: ScoreFactor[];
  unavailable?: boolean;
}): ScoreComponentBreakdown {
  return {
    key: args.key,
    label: args.label,
    score: roundScore(args.score),
    maxPoints: args.maxPoints,
    earnedPoints: roundScore(args.score * args.maxPoints / 100),
    coverage: roundScore(clamp(args.coverage, 0, 1) * 100),
    status: evidenceStatus(args.coverage, args.unavailable),
    factors: args.factors,
  };
}

function buildScoreBreakdown(args: {
  scores: ScoreVector;
  performance: ComponentScore;
  fit: ComponentScore;
  price: ComponentScore;
  condition: ComponentScore;
  longevity: ComponentScore;
}): ScoreBreakdown {
  const components = [
    component({ key: "performance", label: "基本性能", score: args.scores.hardware, maxPoints: SCORE_WEIGHTS.performance, coverage: args.performance.coverage, factors: args.performance.factors }),
    component({ key: "fit", label: "用途適合", score: args.scores.fit, maxPoints: SCORE_WEIGHTS.fit, coverage: args.fit.coverage, factors: args.fit.factors }),
    component({ key: "price", label: "価格妥当性", score: args.scores.value, maxPoints: SCORE_WEIGHTS.price, coverage: args.price.coverage, factors: args.price.factors, unavailable: args.price.coverage === 0 }),
    component({ key: "condition", label: "状態・保証", score: args.scores.condition, maxPoints: SCORE_WEIGHTS.condition, coverage: args.condition.coverage, factors: args.condition.factors }),
    component({ key: "longevity", label: "将来性", score: args.scores.longevity, maxPoints: SCORE_WEIGHTS.longevity, coverage: args.longevity.coverage, factors: args.longevity.factors }),
  ];
  const subtotalPoints = components.reduce((sum, item) => sum + item.earnedPoints, 0);
  const riskPenalty = Math.max(0, args.scores.risk - 20) * 0.38;
  const evidencePenalty = Math.max(0, 70 - args.scores.confidence) * 0.20;
  const evidenceCoverage = components.reduce((sum, item) => sum + item.coverage * item.maxPoints, 0) / 100;
  return {
    method: "weighted_non_compensatory_v1",
    maximumPoints: 100,
    subtotalPoints: roundScore(subtotalPoints),
    riskPenalty: roundScore(riskPenalty),
    evidencePenalty: roundScore(evidencePenalty),
    totalPoints: roundScore(clamp(subtotalPoints - riskPenalty - evidencePenalty)),
    evidenceCoverage: roundScore(evidenceCoverage),
    components,
  };
}

export function decide(scores: ScoreVector, constraints: HardConstraint[] = []): Decision {
  if (constraints.some((x) => x.severity === "critical" && x.known)) return "avoid";
  if (scores.confidence < 45) return "insufficient_data";
  if (constraints.some((x) => x.severity === "critical" && !x.known)) return "avoid";
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
  const fitFactors: ScoreFactor[] = [];
  let fitKnownWeight = 0;
  let fitTotalWeight = 0;
  let essentialKnown = 0;
  let essentialTotal = 0;

  for (const req of input.profile.requirements) {
    const actual = extractMetric(req.metric, input.pc, input.hardware);
    const label = metricLabel(req.metric);
    fitTotalWeight += req.weight;
    if (req.essential) essentialTotal += 1;
    if (actual == null) {
      const policy = req.unknownPolicy ?? (req.essential ? "block" : "warn");
      if (policy === "block") constraints.push({ code: `missing:${req.metric}`, severity: "critical", known: false, message: `${label}が未入力、または判定用データがありません` });
      else if (policy === "warn") warnings.push(`${label}を確認できないため、この項目は判定材料が少なくなっています。`);
      fitFactors.push({ key: req.metric, label, score: null, weight: req.weight, coverage: 0, status: "unavailable", actual: null, minimum: req.minimum, preferred: req.preferred });
      continue;
    }
    if (req.essential) essentialKnown += 1;
    const requirementScore = scoreRequirement(actual, req);
    fitParts.push({ value: requirementScore, weight: req.weight });
    fitKnownWeight += req.weight;
    fitFactors.push({ key: req.metric, label, score: roundScore(requirementScore), weight: req.weight, coverage: 1, status: "measured", actual, minimum: req.minimum, preferred: req.preferred });
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

  const fitCoverage = fitTotalWeight > 0 ? clamp(fitKnownWeight / fitTotalWeight, 0, 1) : 0;
  const fitRaw = clamp(weightedAverage(fitParts, 45));
  const fit = blendUnknown(fitRaw, fitCoverage, 45);
  const value = scoreMarketValue(input.pc.commerce.priceJpy, input.market);
  const conditionResult = scoreCondition(input);
  const performanceResult = scoreHardware(input);
  const longevityResult = scoreLongevity(input, fit, fitCoverage);
  const condition = clamp(conditionResult.score);
  const hardware = clamp(performanceResult.score);
  const longevity = clamp(longevityResult.score);
  const risk = deriveRisk(input, constraints);
  const confidence = deriveConfidence(input, essentialKnown, essentialTotal);
  const scores: ScoreVector = { hardware, fit, value, condition, longevity, risk, confidence };
  const priceCoverage = input.pc.commerce.priceJpy != null && input.market ? marketConfidence(input.market) / 100 : 0;
  const priceRatio = input.pc.commerce.priceJpy != null && input.market?.fairPriceJpy
    ? input.pc.commerce.priceJpy / input.market.fairPriceJpy
    : null;
  const priceResult: ComponentScore = {
    score: value,
    coverage: priceCoverage,
    factors: [{
      key: "price_to_market",
      label: "販売価格と相場中央値の比較",
      score: priceRatio == null ? null : roundScore(value),
      weight: 1,
      coverage: priceCoverage,
      status: priceRatio == null ? "unavailable" : evidenceStatus(priceCoverage),
      actual: priceRatio == null ? null : roundScore(priceRatio * 100),
      preferred: 100,
    }],
  };
  const fitResult: ComponentScore = { score: fit, coverage: fitCoverage, factors: fitFactors };
  const scoreBreakdown = buildScoreBreakdown({ scores, performance: performanceResult, fit: fitResult, price: priceResult, condition: conditionResult, longevity: longevityResult });

  if (!input.market && (input.context ?? "purchase") === "purchase") warnings.push("比較できる相場データがないため、販売価格は良い・悪いのどちらにも判定していません。");
  if (input.market?.source === "user_estimate") warnings.push("比較相場は入力された参考価格です。実売データとは別に扱っています。");
  if (value >= 85) reasons.push({ code: "value:good", kind: "positive", message: "入力された比較相場に対して販売価格は安めです" });
  if (value < 45) reasons.push({ code: "value:poor", kind: "warning", message: "入力された比較相場に対して販売価格が高めです" });

  const decision = applyMarketTrustGate(decide(scores, constraints), input, warnings);
  return {
    scores: { ...scores, overall: scoreBreakdown.totalPoints },
    scoreBreakdown,
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
  const empty = (score: number): ComponentScore => ({ score, coverage: 0, factors: [] });
  const scoreBreakdown = buildScoreBreakdown({
    scores: args.scores,
    performance: empty(args.scores.hardware),
    fit: empty(args.scores.fit),
    price: empty(args.scores.value),
    condition: empty(args.scores.condition),
    longevity: empty(args.scores.longevity),
  });
  return {
    scores: { ...args.scores, overall: scoreBreakdown.totalPoints },
    scoreBreakdown,
    decision: decide(args.scores, args.constraints ?? []),
    reasons: args.reasons ?? [],
    reasonDetails: [],
    warnings: args.warnings ?? [],
    constraints: args.constraints ?? [],
    engineVersion: args.engineVersion,
    knowledgeVersion: args.knowledgeVersion,
  };
}
