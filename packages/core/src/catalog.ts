import intelMobileCpuData from "../../../knowledge/hardware/cpu/intel-mobile.json";
import intelDesktopCpuData from "../../../knowledge/hardware/cpu/intel-desktop.json";
import intelCoreUltraCpuData from "../../../knowledge/hardware/cpu/intel-core-ultra.json";
import amdMobileCpuData from "../../../knowledge/hardware/cpu/amd-mobile.json";
import amdDesktopCpuData from "../../../knowledge/hardware/cpu/amd-desktop.json";
import appleSiliconCpuData from "../../../knowledge/hardware/cpu/apple-silicon.json";
import integratedGpuData from "../../../knowledge/hardware/gpu/integrated.json";
import nvidiaDesktopGpuData from "../../../knowledge/hardware/gpu/nvidia-desktop.json";
import nvidiaLaptopGpuData from "../../../knowledge/hardware/gpu/nvidia-laptop.json";
import amdRadeonGpuData from "../../../knowledge/hardware/gpu/amd-radeon.json";
import intelArcGpuData from "../../../knowledge/hardware/gpu/intel-arc.json";
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

export const CPU_CATALOG: HardwareCatalogEntry<CpuCapabilities>[] = [
  ...intelMobileCpuData,
  ...intelDesktopCpuData,
  ...intelCoreUltraCpuData,
  ...amdMobileCpuData,
  ...amdDesktopCpuData,
  ...appleSiliconCpuData,
] as HardwareCatalogEntry<CpuCapabilities>[];

export const GPU_CATALOG: HardwareCatalogEntry<GpuCapabilities>[] = [
  ...integratedGpuData,
  ...nvidiaDesktopGpuData,
  ...nvidiaLaptopGpuData,
  ...amdRadeonGpuData,
  ...intelArcGpuData,
] as HardwareCatalogEntry<GpuCapabilities>[];

function adjustGpuByTgp(
  entry: HardwareCatalogEntry<GpuCapabilities>,
  tgpW: number | null | undefined,
): { capabilities: GpuCapabilities; confidence: number } {
  if (!entry.tgpRangeW) return { capabilities: entry.capabilities, confidence: entry.confidence };
  if (tgpW == null) return { capabilities: entry.capabilities, confidence: Math.max(0, entry.confidence - 12) };

  const [minW, maxW] = entry.tgpRangeW;
  const bounded = Math.max(minW, Math.min(maxW, tgpW));
  const position = maxW === minW ? 1 : (bounded - minW) / (maxW - minW);

  // Conservative relative model for internal ranking only. It is deliberately
  // not exposed as a linear FPS claim; real laptop behaviour also depends on
  // cooling, Dynamic Boost, CPU limits and chassis design.
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
