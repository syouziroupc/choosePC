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

export interface NormalizedPC {
  manufacturer?: string | null;
  model?: string | null;
  category: DeviceCategory;
  cpu?: {
    canonicalId?: string | null;
    raw?: string | null;
    confidence: number;
  } | null;
  gpu?: {
    canonicalId?: string | null;
    raw?: string | null;
    variant?: GpuVariant;
    tgpW?: number | null;
    vramGb?: number | null;
    confidence: number;
  } | null;
  memory?: {
    sizeGb?: number | null;
    type?: string | null;
    channels?: number | null;
    upgradeable?: boolean | null;
  } | null;
  storage?: Array<{
    kind: "nvme_ssd" | "sata_ssd" | "hdd" | "emmc" | "unknown";
    sizeGb?: number | null;
  }>;
  display?: {
    sizeInch?: number | null;
    width?: number | null;
    height?: number | null;
    refreshHz?: number | null;
    vrr?: boolean | null;
  } | null;
  mobility?: {
    weightKg?: number | null;
    batteryWh?: number | null;
    adapterW?: number | null;
  } | null;
  condition: {
    type: ConditionType;
    grade?: string | null;
    batteryHealthPct?: number | null;
  };
  commerce: {
    priceJpy?: number | null;
    seller?: string | null;
    warrantyDays?: number | null;
    sourceUrl?: string | null;
  };
  confidence: Record<string, number>;
  extra?: Record<string, unknown>;
}

export type Decision =
  | "strong_buy"
  | "buy"
  | "fair"
  | "overpriced"
  | "avoid"
  | "insufficient_data";

export interface ScoreVector {
  hardware: number;
  fit: number;
  value: number;
  condition: number;
  longevity: number;
  risk: number;
  confidence: number;
}

export interface HardConstraint {
  code: string;
  severity: "warning" | "critical";
  known: boolean;
}

export interface EvaluationResult {
  scores: ScoreVector & { overall: number };
  decision: Decision;
  reasons: string[];
  warnings: string[];
  engineVersion: string;
  knowledgeVersion: string;
}
