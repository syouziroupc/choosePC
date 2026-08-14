import type { NormalizedPC, ResolvedHardware } from "./types";

export interface ProductSignature {
  key: string;
  quality: "exact_model" | "configuration" | "partial";
  components: Record<string, string | number | null>;
}

function token(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

function storageBucket(pc: NormalizedPC): number | null {
  const total = pc.storage?.reduce((sum, item) => sum + (item.sizeGb ?? 0), 0) ?? 0;
  if (!total) return null;
  const common = [64, 128, 256, 512, 1024, 2048, 4096, 8192];
  return common.reduce((best, candidate) => Math.abs(candidate - total) < Math.abs(best - total) ? candidate : best, common[0]);
}

function ramBucket(pc: NormalizedPC): number | null {
  const ram = pc.memory?.sizeGb;
  if (!ram) return null;
  const common = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 256];
  return common.reduce((best, candidate) => Math.abs(candidate - ram) < Math.abs(best - ram) ? candidate : best, common[0]);
}

export function createProductSignature(pc: NormalizedPC, hardware: ResolvedHardware): ProductSignature {
  const manufacturer = token(pc.manufacturer);
  const model = token(pc.model);
  const condition = pc.condition.type;
  const ram = ramBucket(pc);
  const storage = storageBucket(pc);
  const cpu = hardware.cpuId ?? token(pc.cpu?.raw);
  const gpu = hardware.gpuId ?? token(pc.gpu?.raw);
  const shared = {
    category: pc.category,
    manufacturer,
    model,
    condition,
    grade: pc.condition.grade ?? null,
    cpu,
    cpuGeneral: hardware.cpu?.general ?? null,
    cpuSingle: hardware.cpu?.single ?? null,
    gpu,
    gpu1080: hardware.gpu?.gaming1080 ?? null,
    gpuCompute: hardware.gpu?.compute ?? null,
    gpuVariant: hardware.gpuVariant ?? pc.gpu?.variant ?? null,
    ram,
    storage,
  };

  if (manufacturer && model) {
    const components = shared;
    return {
      key: ["model", pc.category, manufacturer, model, condition, cpu ?? "cpu-unknown", gpu ?? "gpu-none", `r${ram ?? 0}`, `s${storage ?? 0}`].join(":"),
      quality: "exact_model",
      components,
    };
  }

  if (cpu && (gpu || !pc.category.includes("gaming")) && ram) {
    const components = shared;
    return {
      key: ["config", pc.category, condition, cpu, gpu ?? "gpu-none", `r${ram}`, `s${storage ?? 0}`].join(":"),
      quality: "configuration",
      components,
    };
  }

  const components = shared;
  return {
    key: ["partial", pc.category, condition, cpu ?? "cpu-unknown", gpu ?? "gpu-unknown", `r${ram ?? 0}`, `s${storage ?? 0}`].join(":"),
    quality: "partial",
    components,
  };
}

export function signatureSimilarity(target: ProductSignature, candidate: ProductSignature): number {
  if (target.key === candidate.key) return 1;
  const a = target.components;
  const b = candidate.components;
  if (a.category !== b.category) return 0;

  const conditionCompatibility = a.condition === b.condition
    ? 1
    : a.condition === "unknown" || b.condition === "unknown"
      ? 0.55
      : new Set([a.condition, b.condition]).size === 2 && [a.condition, b.condition].every((value) => value === "used" || value === "refurbished")
        ? 0.75
        : 0;
  if (conditionCompatibility === 0) return 0;

  let score = 0.12 + 0.08 * conditionCompatibility;
  const compare = (key: string, weight: number, tolerance?: number) => {
    const av = a[key];
    const bv = b[key];
    if (av == null || bv == null) return;
    if (typeof av === "number" && typeof bv === "number" && tolerance) {
      const relative = Math.abs(av - bv) / Math.max(av, bv, 1);
      score += weight * Math.max(0, 1 - relative / tolerance);
    } else if (av === bv) {
      score += weight;
    }
  };

  compare("manufacturer", 0.05);
  compare("model", 0.30);
  if (a.cpu != null && a.cpu === b.cpu) score += 0.17;
  else {
    compare("cpuGeneral", 0.11, 0.45);
    compare("cpuSingle", 0.06, 0.40);
  }
  if (a.gpu != null && a.gpu === b.gpu && (a.gpuVariant == null || b.gpuVariant == null || a.gpuVariant === b.gpuVariant)) score += 0.13;
  else if (a.gpu == null && b.gpu == null && !String(a.category).includes("gaming")) score += 0.13;
  else {
    compare("gpu1080", 0.08, 0.55);
    compare("gpuCompute", 0.05, 0.55);
  }
  compare("ram", 0.08, 0.75);
  compare("storage", 0.05, 1.0);
  if (a.grade != null && b.grade != null) score += 0.02 * (a.grade === b.grade ? 1 : 0.35);

  return Math.max(0, Math.min(1, score));
}
