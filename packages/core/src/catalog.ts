import cpuCatalogData from "../../../knowledge/hardware/cpu/catalog.json";
import gpuCatalogData from "../../../knowledge/hardware/gpu/catalog.json";
import type { CpuCapabilities, GpuCapabilities, ResolvedHardware } from "./types";

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
}

export const CPU_CATALOG = cpuCatalogData as HardwareCatalogEntry<CpuCapabilities>[];
export const GPU_CATALOG = gpuCatalogData as HardwareCatalogEntry<GpuCapabilities>[];

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

const normalize = (s: string) => s.toLowerCase().replace(/[®™]/g, "").replace(/\s+/g, " ").trim();

function capByExtraction(catalogConfidence: number, extractionConfidence?: number | null): number {
  if (extractionConfidence == null) return catalogConfidence;
  return Math.min(catalogConfidence, Math.max(0, Math.min(100, extractionConfidence)));
}

export function resolveHardware(
  cpuRaw?: string | null,
  gpuRaw?: string | null,
  gpuTgpW?: number | null,
  extraction?: { cpuConfidence?: number | null; gpuConfidence?: number | null },
): ResolvedHardware {
  const cpuText = normalize(cpuRaw ?? "");
  const gpuText = normalize(gpuRaw ?? "");
  const cpu = CPU_CATALOG.find((entry) => entry.aliases.some((alias) => cpuText.includes(normalize(alias))));
  const gpu = [...GPU_CATALOG]
    .sort((a, b) => Number(b.id.includes("laptop")) - Number(a.id.includes("laptop")))
    .find((entry) => entry.aliases.some((alias) => gpuText.includes(normalize(alias))));
  const adjustedGpu = gpu ? adjustGpuByTgp(gpu, gpuTgpW) : null;

  return {
    cpu: cpu?.capabilities ?? null,
    gpu: adjustedGpu?.capabilities ?? null,
    cpuConfidence: cpu ? capByExtraction(cpu.confidence, extraction?.cpuConfidence) : 0,
    gpuConfidence: adjustedGpu
      ? capByExtraction(adjustedGpu.confidence, extraction?.gpuConfidence)
      : gpuRaw
        ? 0
        : 100,
  };
}
