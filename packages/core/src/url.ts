import { CPU_CATALOG, GPU_CATALOG } from "./catalog";

export interface ProductPageExtraction {
  sourceUrl: string;
  title: string | null;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  priceJpy: number | null;
  cpuRaw: string | null;
  gpuRaw: string | null;
  ramGb: number | null;
  storageGb: number | null;
  confidence: Record<string, number>;
}

type JsonLdObject = Record<string, unknown>;

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

function asString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function typeIncludes(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value.toLowerCase() === expected.toLowerCase();
  if (Array.isArray(value)) return value.some((item) => typeof item === "string" && item.toLowerCase() === expected.toLowerCase());
  return false;
}

function flattenJsonLd(value: unknown): JsonLdObject[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const object = value as JsonLdObject;
  const graph = Array.isArray(object["@graph"]) ? object["@graph"].flatMap(flattenJsonLd) : [];
  return [object, ...graph];
}

function extractJsonLdObjects(html: string): JsonLdObject[] {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].slice(0, 20);
  const objects: JsonLdObject[] = [];
  for (const script of scripts) {
    const raw = script[1]?.trim();
    if (!raw || raw.length > 250_000) continue;
    try {
      objects.push(...flattenJsonLd(JSON.parse(raw)));
    } catch {
      // Invalid merchant JSON-LD is ignored; metadata/HTML fallback remains available.
    }
  }
  return objects;
}

function productJsonLd(html: string): JsonLdObject | null {
  return extractJsonLdObjects(html).find((object) => typeIncludes(object["@type"], "Product")) ?? null;
}

function brandFromProduct(product: JsonLdObject | null): string | null {
  if (!product) return null;
  const brand = product.brand;
  if (typeof brand === "string") return brand.trim() || null;
  if (brand && typeof brand === "object") return asString((brand as JsonLdObject).name);
  const manufacturer = product.manufacturer;
  if (typeof manufacturer === "string") return manufacturer.trim() || null;
  if (manufacturer && typeof manufacturer === "object") return asString((manufacturer as JsonLdObject).name);
  return null;
}

function modelFromProduct(product: JsonLdObject | null): string | null {
  if (!product) return null;
  return asString(product.model) ?? asString(product.mpn) ?? asString(product.sku);
}

function priceFromOffer(value: unknown): number | null {
  const offers = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  for (const offer of offers) {
    if (!offer || typeof offer !== "object") continue;
    const object = offer as JsonLdObject;
    const currency = asString(object.priceCurrency)?.toUpperCase() ?? null;
    if (currency && currency !== "JPY") continue;
    for (const candidate of [object.price, object.lowPrice, object.highPrice]) {
      const text = asString(candidate);
      if (!text) continue;
      const number = Number(text.replace(/,/g, ""));
      if (Number.isFinite(number) && number >= 100 && number <= 100_000_000) return Math.round(number);
    }
  }
  return null;
}

function detectCatalogLabel(text: string, type: "cpu" | "gpu"): string | null {
  const normalized = text.toLowerCase().replace(/[®™]/g, "");
  const entries = type === "cpu" ? CPU_CATALOG : GPU_CATALOG;
  const matches = entries.filter((entry) => entry.aliases.some((alias) => normalized.includes(alias.toLowerCase())));
  if (!matches.length) return null;
  matches.sort((a, b) => Math.max(...b.aliases.map((item) => item.length)) - Math.max(...a.aliases.map((item) => item.length)));
  return matches[0].label;
}

function parseMemory(text: string): number | null {
  const patterns = [
    /(\d{1,4})\s*gb\s*(?:ram|memory|メモリ)/gi,
    /(?:ram|memory|メモリ)\s*[:：=]?\s*(\d{1,4})\s*gb/gi,
  ];
  for (const pattern of patterns) {
    const candidates = [...text.matchAll(pattern)]
      .map((match) => Number(match[1]))
      .filter((value) => value >= 4 && value <= 4096);
    if (candidates.length) return candidates[0];
  }
  return null;
}

function parseStorage(text: string): number | null {
  const tb = text.match(/(?:ssd|nvme|storage|ストレージ)[^0-9]{0,16}(\d(?:\.\d)?)\s*tb/i) ?? text.match(/(\d(?:\.\d)?)\s*tb[^\n<]{0,12}(?:ssd|nvme|storage|ストレージ)/i);
  if (tb) return Math.round(Number(tb[1]) * 1024);
  const gb = text.match(/(?:ssd|nvme|storage|ストレージ)[^0-9]{0,16}(\d{3,5})\s*gb/i) ?? text.match(/(\d{3,5})\s*gb[^\n<]{0,12}(?:ssd|nvme|storage|ストレージ)/i);
  return gb ? Number(gb[1]) : null;
}

function parsePrice(text: string): number | null {
  const yen = text.match(/(?:¥|￥)\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,8})/);
  return yen ? Number(yen[1].replace(/,/g, "")) : null;
}

function stripMarkup(html: string, maxLength = 120_000): string {
  return unescapeHtml(
    html
      .slice(0, 450_000)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, maxLength),
  );
}

export function extractProductPage(html: string, sourceUrl: string): ProductPageExtraction {
  const product = productJsonLd(html);
  const titleMeta = textFromMeta(html, ["og:title", "twitter:title"]);
  const titleTag = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)?.[1];
  const metaDescription = textFromMeta(html, ["og:description", "description"]);
  const structuredTitle = asString(product?.name);
  const structuredDescription = asString(product?.description);
  const title = (structuredTitle ?? titleMeta ?? (titleTag ? unescapeHtml(titleTag.replace(/<[^>]+>/g, " ").trim()) : null))?.slice(0, 240) ?? null;
  const description = (structuredDescription ?? metaDescription)?.slice(0, 1000) ?? null;
  const manufacturer = brandFromProduct(product);
  const model = modelFromProduct(product);

  const primaryText = [structuredTitle, structuredDescription, titleMeta, metaDescription].filter(Boolean).join("\n");
  const visibleFallback = stripMarkup(html);
  const cpuPrimary = detectCatalogLabel(primaryText, "cpu");
  const gpuPrimary = detectCatalogLabel(primaryText, "gpu");
  const ramPrimary = parseMemory(primaryText);
  const storagePrimary = parseStorage(primaryText);
  const cpuRaw = cpuPrimary ?? detectCatalogLabel(visibleFallback, "cpu");
  const gpuRaw = gpuPrimary ?? detectCatalogLabel(visibleFallback, "gpu");
  const ramGb = ramPrimary ?? parseMemory(visibleFallback);
  const storageGb = storagePrimary ?? parseStorage(visibleFallback);
  const structuredPrice = priceFromOffer(product?.offers);
  const priceJpy = structuredPrice ?? parsePrice([titleMeta, metaDescription, visibleFallback.slice(0, 25_000)].filter(Boolean).join("\n"));

  return {
    sourceUrl,
    title,
    description,
    manufacturer,
    model,
    priceJpy,
    cpuRaw,
    gpuRaw,
    ramGb,
    storageGb,
    confidence: {
      title: structuredTitle ? 98 : title ? 85 : 0,
      manufacturer: manufacturer ? 95 : 0,
      model: model ? 88 : 0,
      price: structuredPrice ? 96 : priceJpy ? 65 : 0,
      cpu: cpuPrimary ? 92 : cpuRaw ? 58 : 0,
      gpu: gpuPrimary ? 92 : gpuRaw ? 58 : 0,
      memory: ramPrimary ? 86 : ramGb ? 55 : 0,
      storage: storagePrimary ? 86 : storageGb ? 55 : 0,
    },
  };
}
