import intelMobileCpuData from "../../../knowledge/hardware/cpu/intel-mobile.json";
import intelDesktopCpuData from "../../../knowledge/hardware/cpu/intel-desktop.json";
import intelCoreUltraCpuData from "../../../knowledge/hardware/cpu/intel-core-ultra.json";
import intelLegacyCpuData from "../../../knowledge/hardware/cpu/intel-legacy-4th-7th.json";
import workstationCpuData from "../../../knowledge/hardware/cpu/workstation.json";
import amdMobileCpuData from "../../../knowledge/hardware/cpu/amd-mobile.json";
import amdDesktopCpuData from "../../../knowledge/hardware/cpu/amd-desktop.json";
import appleSiliconCpuData from "../../../knowledge/hardware/cpu/apple-silicon.json";
import integratedGpuData from "../../../knowledge/hardware/gpu/integrated.json";
import nvidiaDesktopGpuData from "../../../knowledge/hardware/gpu/nvidia-desktop.json";
import nvidiaLaptopGpuData from "../../../knowledge/hardware/gpu/nvidia-laptop.json";
import nvidiaMainstreamLaptopGpuData from "../../../knowledge/hardware/gpu/nvidia-mainstream-laptop.json";
import amdRadeonGpuData from "../../../knowledge/hardware/gpu/amd-radeon.json";
import amdRadeonLaptopGpuData from "../../../knowledge/hardware/gpu/amd-radeon-laptop.json";
import intelArcGpuData from "../../../knowledge/hardware/gpu/intel-arc.json";
import workstationGpuData from "../../../knowledge/hardware/gpu/workstation.json";
import type { CpuCapabilities, GpuCapabilities, GpuVariant, ResolvedHardware } from "./types";

export interface HardwareCatalogEntry<T> {
  id: string;
  label: string;
  aliases: string[];
  capabilities: T;
  confidence: number;
  status: "provisional" | "verified";
  method?: string;
  sources?: string[];
  tgpRangeW?: [number, number];
  vramOptionsGb?: number[];
  variant?: GpuVariant;
}

// These IDs existed before the catalog expansion and are embedded in product
// signatures and may already exist as D1 foreign-key targets. They are stable
// public data identities even though the split source files use systematic IDs.
const LEGACY_IDS: Record<string, string> = {
  "Intel Core i5-8365U": "intel-i5-8365u",
  "Intel Core i5-1135G7": "intel-i5-1135g7",
  "Intel Core i5-1235U": "intel-i5-1235u",
  "AMD Ryzen 5 5600U": "amd-r5-5600u",
  "AMD Ryzen 5 5600H": "amd-r5-5600h",
  "Intel Core i5-12400F": "intel-i5-12400f",
  "AMD Ryzen 5 7600": "amd-r5-7600",
  "AMD Ryzen 7 7800X3D": "amd-r7-7800x3d",
  "Intel UHD Graphics 620": "intel-uhd-620",
  "Intel Iris Xe Graphics": "intel-iris-xe",
  "GeForce GTX 1650 Laptop": "nvidia-gtx1650-laptop",
  "GeForce RTX 3050 Laptop": "nvidia-rtx3050-laptop",
  "GeForce RTX 3060 Laptop": "nvidia-rtx3060-laptop",
  "GeForce RTX 4060 Laptop": "nvidia-rtx4060-laptop",
  "GeForce RTX 5060 Laptop": "nvidia-rtx5060-laptop",
  "GeForce RTX 3060": "nvidia-rtx3060-desktop",
  "GeForce RTX 4060": "nvidia-rtx4060-desktop",
};

function withStableIds<T>(entries: readonly HardwareCatalogEntry<T>[]): HardwareCatalogEntry<T>[] {
  return entries.map((entry) => ({ ...entry, id: LEGACY_IDS[entry.label] ?? entry.id }));
}

export const CPU_CATALOG: HardwareCatalogEntry<CpuCapabilities>[] = withStableIds([
  ...intelLegacyCpuData,
  ...intelMobileCpuData,
  ...intelDesktopCpuData,
  ...intelCoreUltraCpuData,
  ...amdMobileCpuData,
  ...amdDesktopCpuData,
  ...appleSiliconCpuData,
  ...workstationCpuData,
] as HardwareCatalogEntry<CpuCapabilities>[]);

export const GPU_CATALOG: HardwareCatalogEntry<GpuCapabilities>[] = withStableIds([
  ...integratedGpuData,
  ...nvidiaMainstreamLaptopGpuData,
  ...nvidiaDesktopGpuData,
  ...nvidiaLaptopGpuData,
  ...amdRadeonGpuData,
  ...amdRadeonLaptopGpuData,
  ...intelArcGpuData,
  ...workstationGpuData,
] as HardwareCatalogEntry<GpuCapabilities>[]);

function adjustGpuByTgp(
  entry: HardwareCatalogEntry<GpuCapabilities>,
  tgpW: number | null | undefined,
): { capabilities: GpuCapabilities; confidence: number } {
  if (!entry.tgpRangeW) return { capabilities: entry.capabilities, confidence: entry.confidence };
  if (tgpW == null) return { capabilities: entry.capabilities, confidence: Math.max(0, entry.confidence - 12) };

  const [minW, maxW] = entry.tgpRangeW;
  const bounded = Math.max(minW, Math.min(maxW, tgpW));
  const position = maxW === minW ? 1 : (bounded - minW) / (maxW - minW);

  const multiplier = 0.74 + position * 0.26;
  const scale = (value: number | undefined) =>
    value == null ? undefined : Math.max(0, Math.min(100, value * multiplier));

  return {
    capabilities: {
      gaming1080: scale(entry.capabilities.gaming1080)!,
      gaming1440: scale(entry.capabilities.gaming1440)!,
      gaming4k: scale(entry.capabilities.gaming4k)!,
      compute: scale(entry.capabilities.compute)!,
      rayTracing: scale(entry.capabilities.rayTracing),
    },
    confidence: entry.confidence,
  };
}

const normalize = (s: string) => s.toLowerCase().replace(/[®™]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

function bestCatalogMatch<T>(entries: readonly HardwareCatalogEntry<T>[], raw?: string | null): HardwareCatalogEntry<T> | null {
  const text = normalize(raw ?? "");
  if (!text) return null;
  let best: { entry: HardwareCatalogEntry<T>; length: number } | null = null;
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      const normalizedAlias = normalize(alias);
      if (!normalizedAlias || !text.includes(normalizedAlias)) continue;
      if (!best || normalizedAlias.length > best.length) best = { entry, length: normalizedAlias.length };
    }
  }
  return best?.entry ?? null;
}

function capByExtraction(catalogConfidence: number, extractionConfidence?: number | null): number {
  if (extractionConfidence == null) return catalogConfidence;
  return Math.min(catalogConfidence, Math.max(0, Math.min(100, extractionConfidence)));
}

function fixedVram(entry: HardwareCatalogEntry<GpuCapabilities> | null): number | null {
  return entry?.vramOptionsGb?.length === 1 ? entry.vramOptionsGb[0] : null;
}

export function resolveHardware(
  cpuRaw?: string | null,
  gpuRaw?: string | null,
  gpuTgpW?: number | null,
  extraction?: { cpuConfidence?: number | null; gpuConfidence?: number | null },
): ResolvedHardware {
  const cpu = bestCatalogMatch(CPU_CATALOG, cpuRaw);
  const gpu = bestCatalogMatch(GPU_CATALOG, gpuRaw);
  const adjustedGpu = gpu ? adjustGpuByTgp(gpu, gpuTgpW) : null;

  return {
    cpuId: cpu?.id ?? null,
    gpuId: gpu?.id ?? null,
    cpu: cpu?.capabilities ?? null,
    gpu: adjustedGpu?.capabilities ?? null,
    gpuVramGb: fixedVram(gpu),
    gpuVariant: gpu?.variant ?? null,
    cpuConfidence: cpu ? capByExtraction(cpu.confidence, extraction?.cpuConfidence) : 0,
    gpuConfidence: adjustedGpu
      ? capByExtraction(adjustedGpu.confidence, extraction?.gpuConfidence)
      : gpuRaw
        ? 0
        : 100,
  };
}
