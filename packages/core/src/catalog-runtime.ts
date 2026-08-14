import { CPU_CATALOG_DATA, GPU_CATALOG_DATA } from "./catalog-data";
import { STABLE_HARDWARE_IDS } from "./catalog-stable-ids";
import type { CpuCapabilities, GpuCapabilities, GpuVariant, ResolvedHardware } from "./types";

export interface HardwareCatalogEntry<T> {
  id: string; label: string; aliases: string[]; capabilities: T; confidence: number;
  status: "provisional" | "verified"; method?: string; sources?: string[];
  tgpRangeW?: [number, number]; vramOptionsGb?: number[]; variant?: GpuVariant;
}

const stable = <T>(entries: readonly HardwareCatalogEntry<T>[]) => entries.map((entry) => ({ ...entry, id: STABLE_HARDWARE_IDS[entry.label] ?? entry.id }));
export const CPU_CATALOG = stable(CPU_CATALOG_DATA as HardwareCatalogEntry<CpuCapabilities>[]);
export const GPU_CATALOG = stable(GPU_CATALOG_DATA as HardwareCatalogEntry<GpuCapabilities>[]);
const normalize = (s: string) => s.toLowerCase().replace(/[®™]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

function best<T>(entries: readonly HardwareCatalogEntry<T>[], raw?: string | null) {
  const text = normalize(raw ?? "");
  if (!text) return null;
  let found: { entry: HardwareCatalogEntry<T>; length: number } | null = null;
  for (const entry of entries) for (const alias of entry.aliases) {
    const key = normalize(alias);
    if (key && text.includes(key) && (!found || key.length > found.length)) found = { entry, length: key.length };
  }
  return found?.entry ?? null;
}

function bestGpu(raw?: string | null, preferred?: GpuVariant | null) {
  const text = normalize(raw ?? "");
  if (!text) return null;
  let found: { entry: HardwareCatalogEntry<GpuCapabilities>; length: number; variant: number } | null = null;
  for (const entry of GPU_CATALOG) {
    const aliases = [...entry.aliases];
    if (preferred === "laptop" && entry.variant === "laptop") aliases.push(entry.label.replace(/\s+Laptop(?:\s+GPU)?$/i, ""));
    for (const alias of aliases) {
      const key = normalize(alias);
      if (!key || !text.includes(key)) continue;
      const variant = preferred && entry.variant === preferred ? 2 : entry.variant === "unknown" ? 1 : 0;
      if (!found || key.length > found.length || (key.length === found.length && variant > found.variant)) found = { entry, length: key.length, variant };
    }
  }
  return found?.entry ?? null;
}

function adjust(entry: HardwareCatalogEntry<GpuCapabilities>, tgpW?: number | null) {
  if (!entry.tgpRangeW) return { capabilities: entry.capabilities, confidence: entry.confidence };
  if (tgpW == null) return { capabilities: entry.capabilities, confidence: Math.max(0, entry.confidence - 12) };
  const [min, max] = entry.tgpRangeW;
  const position = max === min ? 1 : (Math.max(min, Math.min(max, tgpW)) - min) / (max - min);
  const multiplier = 0.74 + position * 0.26;
  const scale = (v?: number) => v == null ? undefined : Math.max(0, Math.min(100, v * multiplier));
  return { capabilities: { gaming1080: scale(entry.capabilities.gaming1080)!, gaming1440: scale(entry.capabilities.gaming1440)!, gaming4k: scale(entry.capabilities.gaming4k)!, compute: scale(entry.capabilities.compute)!, rayTracing: scale(entry.capabilities.rayTracing) }, confidence: entry.confidence };
}

const capped = (catalog: number, extracted?: number | null) => extracted == null ? catalog : Math.min(catalog, Math.max(0, Math.min(100, extracted)));

export function resolveHardware(cpuRaw?: string | null, gpuRaw?: string | null, gpuTgpW?: number | null, extraction?: { cpuConfidence?: number | null; gpuConfidence?: number | null; gpuVariant?: GpuVariant | null }): ResolvedHardware {
  const cpu = best(CPU_CATALOG, cpuRaw);
  const gpu = bestGpu(gpuRaw, extraction?.gpuVariant);
  const adjusted = gpu ? adjust(gpu, gpuTgpW) : null;
  return {
    cpuId: cpu?.id ?? null, gpuId: gpu?.id ?? null, cpu: cpu?.capabilities ?? null, gpu: adjusted?.capabilities ?? null,
    gpuVramGb: gpu?.vramOptionsGb?.length === 1 ? gpu.vramOptionsGb[0] : null, gpuVariant: gpu?.variant ?? null,
    cpuConfidence: cpu ? capped(cpu.confidence, extraction?.cpuConfidence) : 0,
    gpuConfidence: adjusted ? capped(adjusted.confidence, extraction?.gpuConfidence) : gpuRaw ? 0 : 100,
  };
}
