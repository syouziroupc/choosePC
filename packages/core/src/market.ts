import type { MarketEstimate } from "./types";
import { clamp } from "./scoring";

export interface MarketObservationInput {
  priceJpy: number;
  observedAt: string;
  similarity: number;
  sourceConfidence: number;
}

export interface MarketEstimatorOptions {
  minimumSamples?: number;
  halfLifeDays?: number;
  now?: Date;
}

export interface MarketEstimationResult {
  estimate: MarketEstimate | null;
  acceptedSamples: number;
  rejectedSamples: number;
  effectiveSamples: number;
  dispersion: number | null;
}

type WeightedPoint = { price: number; weight: number; ageDays: number; similarity: number; sourceConfidence: number };

const DAY_MS = 86_400_000;

function weightedQuantile(points: WeightedPoint[], quantile: number): number {
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const total = sorted.reduce((sum, point) => sum + point.weight, 0);
  if (total <= 0) return 0;
  const target = total * clamp(quantile, 0, 1);
  let cumulative = 0;
  for (const point of sorted) {
    cumulative += point.weight;
    if (cumulative >= target) return point.price;
  }
  return sorted.at(-1)?.price ?? 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rejectOutliers(points: WeightedPoint[]): { accepted: WeightedPoint[]; rejected: number } {
  if (points.length < 5) return { accepted: points, rejected: 0 };
  const prices = points.map((point) => point.price);
  const center = median(prices);
  const deviations = prices.map((price) => Math.abs(price - center));
  const mad = median(deviations);
  if (mad <= 0) return { accepted: points, rejected: 0 };
  const accepted = points.filter((point) => {
    const modifiedZ = 0.6745 * Math.abs(point.price - center) / mad;
    return modifiedZ <= 3.5;
  });
  return { accepted: accepted.length >= 3 ? accepted : points, rejected: accepted.length >= 3 ? points.length - accepted.length : 0 };
}

function effectiveSampleSize(points: WeightedPoint[]): number {
  const sum = points.reduce((total, point) => total + point.weight, 0);
  const squared = points.reduce((total, point) => total + point.weight ** 2, 0);
  return squared > 0 ? (sum ** 2) / squared : 0;
}

export function estimateMarket(observations: readonly MarketObservationInput[], options: MarketEstimatorOptions = {}): MarketEstimationResult {
  const minimumSamples = options.minimumSamples ?? 3;
  const halfLifeDays = options.halfLifeDays ?? 60;
  const now = options.now ?? new Date();

  const normalized: WeightedPoint[] = observations.flatMap((observation) => {
    const observedAt = new Date(observation.observedAt);
    if (!Number.isFinite(observation.priceJpy) || observation.priceJpy <= 0 || Number.isNaN(observedAt.getTime())) return [];
    const similarity = clamp(observation.similarity, 0, 1);
    const sourceConfidence = clamp(observation.sourceConfidence, 0, 1);
    if (similarity < 0.35 || sourceConfidence < 0.35) return [];
    const ageDays = Math.max(0, (now.getTime() - observedAt.getTime()) / DAY_MS);
    const freshness = Math.pow(0.5, ageDays / Math.max(1, halfLifeDays));
    const weight = similarity ** 2 * sourceConfidence * freshness;
    return weight > 0.02 ? [{ price: Math.round(observation.priceJpy), weight, ageDays, similarity, sourceConfidence }] : [];
  });

  if (normalized.length < minimumSamples) {
    return { estimate: null, acceptedSamples: normalized.length, rejectedSamples: observations.length - normalized.length, effectiveSamples: effectiveSampleSize(normalized), dispersion: null };
  }

  const filtered = rejectOutliers(normalized);
  const points = filtered.accepted;
  if (points.length < minimumSamples) {
    return { estimate: null, acceptedSamples: points.length, rejectedSamples: observations.length - points.length, effectiveSamples: effectiveSampleSize(points), dispersion: null };
  }

  const fairPriceJpy = Math.round(weightedQuantile(points, 0.5));
  const lowPriceJpy = Math.round(weightedQuantile(points, 0.20));
  const highPriceJpy = Math.round(weightedQuantile(points, 0.80));
  const effectiveSamples = effectiveSampleSize(points);
  const averageAge = points.reduce((sum, point) => sum + point.ageDays * point.weight, 0) / points.reduce((sum, point) => sum + point.weight, 0);
  const averageSimilarity = points.reduce((sum, point) => sum + point.similarity * point.weight, 0) / points.reduce((sum, point) => sum + point.weight, 0);
  const averageSource = points.reduce((sum, point) => sum + point.sourceConfidence * point.weight, 0) / points.reduce((sum, point) => sum + point.weight, 0);
  const dispersion = fairPriceJpy > 0 ? Math.max(0, highPriceJpy - lowPriceJpy) / fairPriceJpy : 1;

  const sampleScore = clamp(Math.log2(effectiveSamples + 1) / Math.log2(17) * 100);
  const freshnessScore = clamp(100 - averageAge * 1.1);
  const similarityScore = clamp(averageSimilarity * 100);
  const sourceScore = clamp(averageSource * 100);
  const dispersionScore = clamp(100 - dispersion * 110);
  const confidence = Math.round(clamp(
    sampleScore * 0.30 +
    similarityScore * 0.25 +
    sourceScore * 0.20 +
    freshnessScore * 0.15 +
    dispersionScore * 0.10,
  ));

  return {
    estimate: {
      fairPriceJpy,
      lowPriceJpy,
      highPriceJpy,
      sampleCount: points.length,
      confidence,
      ageDays: Math.round(averageAge),
      source: "observed_market",
    },
    acceptedSamples: points.length,
    rejectedSamples: observations.length - points.length,
    effectiveSamples,
    dispersion,
  };
}
