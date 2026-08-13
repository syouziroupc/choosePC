export type DeviceCategory =
  | "general_laptop"
  | "mobile_laptop"
  | "gaming_laptop"
  | "general_desktop"
  | "gaming_desktop"
  | "bto_desktop"
  | "custom_desktop"
  | "mini_pc"
  | "workstation"
  | "mac";

export type ConditionType = "new" | "used" | "refurbished" | "unknown";
export type GpuVariant = "desktop" | "laptop" | "integrated" | "unknown";
export type Decision = "strong_buy" | "buy" | "fair" | "overpriced" | "avoid" | "insufficient_data";

export type UseCaseId = "office" | "student" | "programming" | "gaming" | "video_editing" | "creative" | "cad_3d" | "local_ai" | "business_mobile";

export type RequirementMetric =
  | "cpuGeneral"
  | "cpuSingle"
  | "cpuMulti"
  | "cpuGaming"
  | "gpu1080"
  | "gpu1440"
  | "gpu4k"
  | "gpuCompute"
  | "ramGb"
  | "storageGb"
  | "vramGb"
  | "refreshHz"
  | "batteryHealthPct"
  | "weightKg";

export interface NormalizedPC {
  manufacturer?: string | null;
  model?: string | null;
  category: DeviceCategory;
  cpu?: { canonicalId?: string | null; raw?: string | null; confidence: number } | null;
  gpu?: { canonicalId?: string | null; raw?: string | null; variant?: GpuVariant; tgpW?: number | null; vramGb?: number | null; confidence: number } | null;
  memory?: { sizeGb?: number | null; type?: string | null; channels?: number | null; upgradeable?: boolean | null; slotsFree?: number | null } | null;
  storage?: Array<{ kind: "nvme_ssd" | "sata_ssd" | "hdd" | "emmc" | "unknown"; sizeGb?: number | null; healthPct?: number | null }>;
  display?: { sizeInch?: number | null; width?: number | null; height?: number | null; refreshHz?: number | null; vrr?: boolean | null; panel?: string | null } | null;
  mobility?: { weightKg?: number | null; batteryWh?: number | null; adapterW?: number | null } | null;
  condition: { type: ConditionType; grade?: "S" | "A" | "B" | "C" | "D" | "unknown" | null; batteryHealthPct?: number | null; defects?: string[] };
  commerce: { priceJpy?: number | null; seller?: string | null; warrantyDays?: number | null; sourceUrl?: string | null };
  confidence: Record<string, number>;
  extra?: { coolingScore?: number | null; upgradeabilityScore?: number | null; platformAgeYears?: number | null; osSupportYears?: number | null; psuWatts?: number | null; recommendedPsuWatts?: number | null; muxSwitch?: boolean | null; notes?: string[]; [key: string]: unknown };
}

export interface CpuCapabilities { general: number; single: number; multi: number; gaming: number; efficiency?: number }
export interface GpuCapabilities { gaming1080: number; gaming1440: number; gaming4k: number; compute: number; rayTracing?: number }
export interface ResolvedHardware {
  cpuId?: string | null;
  gpuId?: string | null;
  cpu?: CpuCapabilities | null;
  gpu?: GpuCapabilities | null;
  cpuConfidence: number;
  gpuConfidence: number;
}

export interface RequirementBand {
  metric: RequirementMetric;
  minimum: number;
  preferred: number;
  weight: number;
  essential?: boolean;
  unknownPolicy?: "block" | "warn" | "neutral";
  direction?: "higher_is_better" | "lower_is_better";
}

export interface UseCaseProfile { id: UseCaseId; name: string; requirements: RequirementBand[]; mobilityWeight?: number; upgradeabilityWeight?: number }

export interface MarketEstimate {
  fairPriceJpy: number;
  source?: "observed_market" | "user_estimate";
  lowPriceJpy?: number;
  highPriceJpy?: number;
  sampleCount: number;
  confidence: number;
  ageDays: number;
}

export interface ScoreVector { hardware: number; fit: number; value: number; condition: number; longevity: number; risk: number; confidence: number }
export interface HardConstraint { code: string; severity: "warning" | "critical"; known: boolean; message?: string }
export interface ReasonDetail { code: string; kind: "positive" | "neutral" | "warning" | "critical"; message: string; metric?: RequirementMetric; actual?: number | null; minimum?: number | null; preferred?: number | null }

export interface EvaluationResult {
  scores: ScoreVector & { overall: number };
  decision: Decision;
  reasons: string[];
  reasonDetails: ReasonDetail[];
  warnings: string[];
  constraints: HardConstraint[];
  engineVersion: string;
  knowledgeVersion: string;
}

export type EvaluationContext = "purchase" | "ownership";
export interface EvaluationInput {
  pc: NormalizedPC;
  profile: UseCaseProfile;
  hardware: ResolvedHardware;
  market?: MarketEstimate | null;
  engineVersion?: string;
  knowledgeVersion?: string;
  context?: EvaluationContext;
}
