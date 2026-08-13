import type { MarketEstimate, NormalizedPC, RequirementBand, RequirementMetric, ResolvedHardware } from "./types";

export const clamp = (n: number, min = 0, max = 100): number => Math.max(min, Math.min(max, n));

export function interpolate(points: Array<[number, number]>, x: number): number {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= sorted[0][0]) return sorted[0][1];
  if (x >= sorted[sorted.length - 1][0]) return sorted[sorted.length - 1][1];
  for (let i = 1; i < sorted.length; i += 1) {
    const [x1, y1] = sorted[i - 1];
    const [x2, y2] = sorted[i];
    if (x <= x2) {
      const t = (x - x1) / (x2 - x1);
      return y1 + (y2 - y1) * t;
    }
  }
  return sorted[sorted.length - 1][1];
}

export function scoreRequirement(actual: number, band: RequirementBand): number {
  if (band.direction === "lower_is_better") {
    const ceiling = band.minimum;
    const target = band.preferred;
    if (ceiling <= target) throw new Error(`INVALID_LOWER_BAND:${band.metric}`);
    if (actual <= target) {
      const headroom = (target - actual) / Math.max(0.1, target);
      return clamp(95 + Math.min(5, headroom * 8));
    }
    if (actual <= ceiling) {
      const t = (ceiling - actual) / (ceiling - target);
      return 70 + t * 25;
    }
    const excessRatio = (actual - ceiling) / Math.max(0.1, ceiling);
    return clamp(55 - excessRatio * 100);
  }
  if (band.preferred <= band.minimum) return actual >= band.minimum ? 100 : clamp((actual / Math.max(1, band.minimum)) * 55);
  if (actual < band.minimum) return clamp((actual / Math.max(1, band.minimum)) * 55);
  if (actual < band.preferred) {
    const t = (actual - band.minimum) / (band.preferred - band.minimum);
    return 70 + t * 25;
  }
  const headroom = (actual - band.preferred) / Math.max(1, band.preferred);
  return clamp(95 + Math.min(5, headroom * 8));
}

export function extractMetric(metric: RequirementMetric, pc: NormalizedPC, hardware: ResolvedHardware): number | null {
  const storageTotal = pc.storage?.reduce((sum, item) => sum + (item.sizeGb ?? 0), 0) ?? null;
  switch (metric) {
    case "cpuGeneral": return hardware.cpu?.general ?? null;
    case "cpuSingle": return hardware.cpu?.single ?? null;
    case "cpuMulti": return hardware.cpu?.multi ?? null;
    case "cpuGaming": return hardware.cpu?.gaming ?? null;
    case "gpu1080": return hardware.gpu?.gaming1080 ?? null;
    case "gpu1440": return hardware.gpu?.gaming1440 ?? null;
    case "gpu4k": return hardware.gpu?.gaming4k ?? null;
    case "gpuCompute": return hardware.gpu?.compute ?? null;
    case "ramGb": return pc.memory?.sizeGb ?? null;
    case "storageGb": return storageTotal;
    case "vramGb": return pc.gpu?.vramGb ?? null;
    case "refreshHz": return pc.display?.refreshHz ?? null;
    case "batteryHealthPct": return pc.condition.batteryHealthPct ?? null;
    case "weightKg": return pc.mobility?.weightKg ?? null;
  }
}

export function scoreMarketValue(priceJpy: number | null | undefined, market?: MarketEstimate | null): number {
  if (!priceJpy || priceJpy <= 0 || !market || market.fairPriceJpy <= 0) return 50;
  const ratio = priceJpy / market.fairPriceJpy;
  return clamp(interpolate([[0.60,100],[0.75,98],[0.85,94],[0.95,86],[1.00,80],[1.08,70],[1.15,58],[1.25,42],[1.40,22],[1.60,5]], ratio));
}

export function marketConfidence(market?: MarketEstimate | null): number {
  if (!market) return 25;
  const sampleFactor = clamp(Math.log2(Math.max(1, market.sampleCount) + 1) / Math.log2(33) * 100);
  const freshnessFactor = clamp(100 - Math.max(0, market.ageDays - 7) * 1.6);
  const computed = clamp(market.confidence * 0.55 + sampleFactor * 0.25 + freshnessFactor * 0.20);
  return market.source === "user_estimate" ? Math.min(45, computed) : computed;
}
