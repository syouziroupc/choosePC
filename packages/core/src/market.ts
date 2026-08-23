import type { MarketEstimate } from "./types";
import { clamp } from "./scoring";

export interface MarketObservationInput { priceJpy: number; observedAt: string; similarity: number; sourceConfidence: number; }
export interface MarketEstimatorOptions { minimumSamples?: number; sparseMinimumSamples?: number; halfLifeDays?: number; now?: Date; }
export interface MarketEstimationResult { estimate: MarketEstimate | null; acceptedSamples: number; rejectedSamples: number; effectiveSamples: number; dispersion: number | null; }
type WeightedPoint = { price: number; weight: number; ageDays: number; similarity: number; sourceConfidence: number };
const DAY_MS = 86_400_000;

function weightedQuantile(points: WeightedPoint[], quantile: number): number {
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const total = sorted.reduce((sum, point) => sum + point.weight, 0);
  if (total <= 0) return 0;
  const target = total * clamp(quantile, 0, 1);
  let cumulative = 0;
  for (const point of sorted) { cumulative += point.weight; if (cumulative >= target) return point.price; }
  return sorted.at(-1)?.price ?? 0;
}
function median(values: number[]): number { if (!values.length) return 0; const sorted = [...values].sort((a,b)=>a-b); const m=Math.floor(sorted.length/2); return sorted.length%2 ? sorted[m] : (sorted[m-1]+sorted[m])/2; }
function rejectOutliers(points: WeightedPoint[]): { accepted: WeightedPoint[]; rejected: number } {
  if (points.length < 5) return { accepted: points, rejected: 0 };
  const prices=points.map((p)=>p.price); const center=median(prices); const mad=median(prices.map((p)=>Math.abs(p-center)));
  if (mad <= 0) return { accepted: points, rejected: 0 };
  const accepted=points.filter((p)=>0.6745*Math.abs(p.price-center)/mad <= 3.5);
  return { accepted: accepted.length >= 3 ? accepted : points, rejected: accepted.length >= 3 ? points.length-accepted.length : 0 };
}
function effectiveSampleSize(points: WeightedPoint[]): number { const sum=points.reduce((t,p)=>t+p.weight,0); const sq=points.reduce((t,p)=>t+p.weight**2,0); return sq>0 ? sum**2/sq : 0; }

function buildEstimate(points: WeightedPoint[], sparse: boolean) {
  const fairPriceJpy=Math.round(weightedQuantile(points,0.5));
  let lowPriceJpy=Math.round(weightedQuantile(points,0.20));
  let highPriceJpy=Math.round(weightedQuantile(points,0.80));
  if (points.length===1) { lowPriceJpy=Math.round(fairPriceJpy*0.70); highPriceJpy=Math.round(fairPriceJpy*1.30); }
  else if (points.length===2) { const sorted=[...points].sort((a,b)=>a.price-b.price); lowPriceJpy=Math.round(sorted[0].price*0.90); highPriceJpy=Math.round(sorted[1].price*1.10); }
  const effectiveSamples=effectiveSampleSize(points); const weight=points.reduce((s,p)=>s+p.weight,0);
  const averageAge=points.reduce((s,p)=>s+p.ageDays*p.weight,0)/weight;
  const averageSimilarity=points.reduce((s,p)=>s+p.similarity*p.weight,0)/weight;
  const averageSource=points.reduce((s,p)=>s+p.sourceConfidence*p.weight,0)/weight;
  const dispersion=fairPriceJpy>0 ? Math.max(0,highPriceJpy-lowPriceJpy)/fairPriceJpy : 1;
  const sampleScore=clamp(Math.log2(effectiveSamples+1)/Math.log2(17)*100);
  const freshnessScore=clamp(100-averageAge*1.1); const similarityScore=clamp(averageSimilarity*100); const sourceScore=clamp(averageSource*100); const dispersionScore=clamp(100-dispersion*110);
  let confidence=Math.round(clamp(sampleScore*0.30+similarityScore*0.25+sourceScore*0.20+freshnessScore*0.15+dispersionScore*0.10));
  if (sparse) confidence=Math.min(points.length===1 ? 28 : 42,confidence);
  const dataQuality: NonNullable<MarketEstimate["dataQuality"]> = sparse
    ? "sparse"
    : confidence >= 70 && effectiveSamples >= 8
      ? "strong"
      : confidence >= 50 && effectiveSamples >= 3
        ? "moderate"
        : "weak";
  return {
    estimate:{
      fairPriceJpy,
      lowPriceJpy,
      highPriceJpy,
      sampleCount:points.length,
      effectiveSampleCount:Math.round(effectiveSamples*100)/100,
      confidence,
      ageDays:Math.round(averageAge),
      dispersionPct:Math.round(dispersion*1000)/10,
      dataQuality,
      method:"weighted_median_mad_v1" as const,
      source:"observed_market" as const,
    },
    effectiveSamples,
    dispersion,
  };
}

export function estimateMarket(observations: readonly MarketObservationInput[], options: MarketEstimatorOptions = {}): MarketEstimationResult {
  const minimumSamples=Math.max(1,options.minimumSamples??3); const sparseMinimumSamples=Math.max(1,Math.min(minimumSamples,options.sparseMinimumSamples??1)); const halfLifeDays=options.halfLifeDays??60; const now=options.now??new Date();
  const normalized: WeightedPoint[]=observations.flatMap((observation)=>{
    const observedAt=new Date(observation.observedAt); if(!Number.isFinite(observation.priceJpy)||observation.priceJpy<=0||Number.isNaN(observedAt.getTime())) return [];
    const similarity=clamp(observation.similarity,0,1); const sourceConfidence=clamp(observation.sourceConfidence,0,1); if(similarity<0.35||sourceConfidence<0.35) return [];
    const ageDays=Math.max(0,(now.getTime()-observedAt.getTime())/DAY_MS); const freshness=Math.pow(0.5,ageDays/Math.max(1,halfLifeDays)); const weight=similarity**2*sourceConfidence*freshness;
    return weight>0.02 ? [{price:Math.round(observation.priceJpy),weight,ageDays,similarity,sourceConfidence}] : [];
  });
  if(normalized.length<sparseMinimumSamples) return {estimate:null,acceptedSamples:normalized.length,rejectedSamples:observations.length-normalized.length,effectiveSamples:effectiveSampleSize(normalized),dispersion:null};
  const filtered=rejectOutliers(normalized); const points=filtered.accepted;
  if(points.length<sparseMinimumSamples) return {estimate:null,acceptedSamples:points.length,rejectedSamples:observations.length-points.length,effectiveSamples:effectiveSampleSize(points),dispersion:null};
  const built=buildEstimate(points,points.length<minimumSamples);
  return {estimate:built.estimate,acceptedSamples:points.length,rejectedSamples:observations.length-points.length,effectiveSamples:built.effectiveSamples,dispersion:built.dispersion};
}
