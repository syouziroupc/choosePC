import { CPU_CATALOG, GPU_CATALOG } from "./catalog";

export interface ProductPageExtraction {
  sourceUrl: string;
  title: string | null;
  description: string | null;
  priceJpy: number | null;
  cpuRaw: string | null;
  gpuRaw: string | null;
  ramGb: number | null;
  storageGb: number | null;
  confidence: Record<string, number>;
}

const unescapeHtml = (input: string) => input.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function textFromMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    const reversed = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
    const match = html.match(re) ?? html.match(reversed);
    if (match?.[1]) return unescapeHtml(match[1].trim());
  }
  return null;
}

function detectCatalogLabel(text: string, type: "cpu" | "gpu"): string | null {
  const normalized = text.toLowerCase().replace(/[®™]/g, "");
  const entries = type === "cpu" ? CPU_CATALOG : GPU_CATALOG;
  const matches = entries.filter((entry) => entry.aliases.some((alias) => normalized.includes(alias.toLowerCase())));
  if (!matches.length) return null;
  matches.sort((a, b) => Math.max(...b.aliases.map((x) => x.length)) - Math.max(...a.aliases.map((x) => x.length)));
  return matches[0].label;
}

function parseMemory(text: string): number | null {
  const candidates = [...text.matchAll(/(?:ram|memory|メモリ)[^0-9]{0,12}(\d{1,3})\s*gb/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 4 && value <= 4096);
  return candidates[0] ?? null;
}

function parseStorage(text: string): number | null {
  const tb = text.match(/(?:ssd|nvme|storage|ストレージ)[^0-9]{0,12}(\d(?:\.\d)?)\s*tb/i);
  if (tb) return Math.round(Number(tb[1]) * 1024);
  const gb = text.match(/(?:ssd|nvme|storage|ストレージ)[^0-9]{0,12}(\d{3,4})\s*gb/i);
  return gb ? Number(gb[1]) : null;
}

function parsePrice(text: string): number | null {
  const jsonPrice = text.match(/["']price["']\s*:\s*["']?([0-9]{3,8}(?:\.[0-9]+)?)/i);
  if (jsonPrice) return Math.round(Number(jsonPrice[1]));
  const yen = text.match(/(?:¥|￥)\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,8})/);
  return yen ? Number(yen[1].replace(/,/g, "")) : null;
}

export function extractProductPage(html: string, sourceUrl: string): ProductPageExtraction {
  const titleMeta = textFromMeta(html, ["og:title", "twitter:title"]);
  const titleTag = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)?.[1];
  const description = textFromMeta(html, ["og:description", "description"]);
  const title = (titleMeta ?? (titleTag ? unescapeHtml(titleTag.replace(/<[^>]+>/g, " ").trim()) : null))?.slice(0, 240) ?? null;
  const combined = `${title ?? ""}\n${description ?? ""}\n${html.slice(0, 450_000)}`;
  const cpuRaw = detectCatalogLabel(combined, "cpu");
  const gpuRaw = detectCatalogLabel(combined, "gpu");
  const priceJpy = parsePrice(combined);
  const ramGb = parseMemory(combined);
  const storageGb = parseStorage(combined);
  return {
    sourceUrl,
    title,
    description: description?.slice(0, 500) ?? null,
    priceJpy,
    cpuRaw,
    gpuRaw,
    ramGb,
    storageGb,
    confidence: {
      title: title ? 85 : 0,
      price: priceJpy ? 65 : 0,
      cpu: cpuRaw ? 90 : 0,
      gpu: gpuRaw ? 90 : 0,
      memory: ramGb ? 60 : 0,
      storage: storageGb ? 60 : 0,
    },
  };
}
