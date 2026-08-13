export type ParsedStockState = "in_stock" | "low_stock" | "out_of_stock" | "sold" | "unavailable" | "unknown";

export interface MerchantPageHints {
  merchant: string | null;
  parserName: string;
  parserVersion: string;
  title: string | null;
  priceJpy: number | null;
  specText: string | null;
  stockState: ParsedStockState;
  confidence: {
    title: number;
    price: number;
    specs: number;
    stock: number;
  };
}

type MerchantProfile = {
  merchant: string;
  parserName: string;
  hosts: string[];
  titleIds?: string[];
  titleClasses?: string[];
  priceIds?: string[];
  priceClasses?: string[];
  scopeIds?: string[];
  scopeClasses?: string[];
};

const PARSER_VERSION = "merchant-adapters-2026-08-13.1";
const MAX_ELEMENT_TEXT = 80_000;
const MAX_SCOPE_TEXT = 140_000;

const PROFILES: MerchantProfile[] = [
  {
    merchant: "Amazon.co.jp",
    parserName: "amazon-jp",
    hosts: ["amazon.co.jp"],
    titleIds: ["productTitle"],
    priceIds: ["priceblock_ourprice", "priceblock_dealprice"],
    priceClasses: ["a-price-whole", "a-offscreen"],
    scopeIds: ["productOverview_feature_div", "prodDetails", "detailBullets_feature_div", "feature-bullets"],
  },
  {
    merchant: "楽天市場",
    parserName: "rakuten-jp",
    hosts: ["rakuten.co.jp"],
    titleIds: ["itemName", "item-name"],
    titleClasses: ["item_name", "item-name"],
    priceIds: ["itemPrice", "item-price"],
    priceClasses: ["price", "item-price"],
    scopeIds: ["itemDescription", "item-description", "itemSpec"],
    scopeClasses: ["item-description", "item_spec", "spec"],
  },
  {
    merchant: "Yahoo!ショッピング",
    parserName: "yahoo-shopping-jp",
    hosts: ["shopping.yahoo.co.jp"],
    titleIds: ["itemTitle", "item-title"],
    titleClasses: ["ItemTitle", "itemTitle", "item-title"],
    priceIds: ["itemPrice", "item-price"],
    priceClasses: ["Price", "price", "item-price"],
    scopeIds: ["itemDescription", "item-description"],
    scopeClasses: ["ItemDescription", "item-description", "spec"],
  },
  {
    merchant: "Lenovo",
    parserName: "lenovo-jp",
    hosts: ["lenovo.com"],
    titleClasses: ["product-title", "product_title", "hero-product-title"],
    priceClasses: ["price", "price-current", "final-price"],
    scopeClasses: ["tech-specs", "techSpecs", "specifications", "product-specs"],
  },
  {
    merchant: "Dell",
    parserName: "dell-jp",
    hosts: ["dell.com"],
    titleClasses: ["product-title", "ps-title", "hero-title"],
    priceClasses: ["ps-dell-price", "price", "sale-price"],
    scopeClasses: ["tech-specs", "specifications", "ps-specs", "configuration"],
  },
  {
    merchant: "HP",
    parserName: "hp-jp",
    hosts: ["hp.com"],
    titleClasses: ["product-title", "product_name", "hero-title"],
    priceClasses: ["price", "price-final", "sale-price"],
    scopeClasses: ["specifications", "tech-specs", "product-specs", "configuration"],
  },
  {
    merchant: "ドスパラ",
    parserName: "dospara-jp",
    hosts: ["dospara.co.jp"],
    titleClasses: ["product-name", "item-name", "product_name"],
    priceClasses: ["price", "product-price", "item-price"],
    scopeClasses: ["spec", "spec-table", "product-spec", "item-spec"],
  },
  {
    merchant: "パソコン工房",
    parserName: "pc-koubou-jp",
    hosts: ["pc-koubou.jp"],
    titleClasses: ["product-name", "item-name", "product_name"],
    priceClasses: ["price", "product-price", "item-price"],
    scopeClasses: ["spec", "spec-table", "product-spec", "item-spec"],
  },
  {
    merchant: "TSUKUMO",
    parserName: "tsukumo-jp",
    hosts: ["tsukumo.co.jp"],
    titleClasses: ["product-name", "item-name", "product_name"],
    priceClasses: ["price", "product-price", "item-price"],
    scopeClasses: ["spec", "spec-table", "product-spec", "item-spec"],
  },
  {
    merchant: "FRONTIER",
    parserName: "frontier-jp",
    hosts: ["frontier-direct.jp"],
    titleClasses: ["product-name", "item-name", "product_name"],
    priceClasses: ["price", "product-price", "item-price"],
    scopeClasses: ["spec", "spec-table", "product-spec", "item-spec"],
  },
  {
    merchant: "Sycom",
    parserName: "sycom-jp",
    hosts: ["sycom.co.jp"],
    titleClasses: ["product-name", "item-name", "product_name"],
    priceClasses: ["price", "product-price", "item-price"],
    scopeClasses: ["spec", "spec-table", "product-spec", "item-spec", "configuration"],
  },
];

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripMarkup(value: string, maxLength = MAX_ELEMENT_TEXT): string {
  return decodeHtml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function elementByAttribute(html: string, attribute: "id" | "class", value: string): string | null {
  const escaped = escapeRegex(value);
  const attributePattern = attribute === "id"
    ? `id=["']${escaped}["']`
    : `class=["'][^"']*(?:^|\\s)${escaped}(?:\\s|$)[^"']*["']`;
  const regex = new RegExp(`<([a-z0-9:-]+)[^>]*${attributePattern}[^>]*>([\\s\\S]{0,${MAX_ELEMENT_TEXT}}?)<\\/\\1>`, "i");
  const match = html.match(regex);
  return match?.[2] ? stripMarkup(match[2]) : null;
}

function firstElementText(html: string, profile: MerchantProfile, kind: "title" | "price" | "scope"): string | null {
  const ids = kind === "title" ? profile.titleIds : kind === "price" ? profile.priceIds : profile.scopeIds;
  const classes = kind === "title" ? profile.titleClasses : kind === "price" ? profile.priceClasses : profile.scopeClasses;
  for (const id of ids ?? []) {
    const text = elementByAttribute(html, "id", id);
    if (text) return text;
  }
  for (const className of classes ?? []) {
    const text = elementByAttribute(html, "class", className);
    if (text) return text;
  }
  return null;
}

function allScopeText(html: string, profile: MerchantProfile): string | null {
  const parts: string[] = [];
  for (const id of profile.scopeIds ?? []) {
    const text = elementByAttribute(html, "id", id);
    if (text) parts.push(text);
  }
  for (const className of profile.scopeClasses ?? []) {
    const text = elementByAttribute(html, "class", className);
    if (text) parts.push(text);
  }
  const unique = [...new Set(parts)].join(" \n ").slice(0, MAX_SCOPE_TEXT);
  return unique || null;
}

function metaContent(html: string, key: string): string | null {
  const escaped = escapeRegex(key);
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property|itemprop)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    if (value) return decodeHtml(value.trim());
  }
  return null;
}

function firstH1(html: string): string | null {
  const value = html.match(/<h1\b[^>]*>([\s\S]{0,20_000}?)<\/h1>/i)?.[1];
  return value ? stripMarkup(value, 500) : null;
}

function numericPrice(value: string): number | null {
  const matches = [
    value.match(/(?:¥|￥)\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,8})/),
    value.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,8})\s*円/),
  ];
  for (const match of matches) {
    if (!match?.[1]) continue;
    const parsed = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(parsed) && parsed >= 100 && parsed <= 100_000_000) return Math.round(parsed);
  }
  return null;
}

function structuredMetaPrice(html: string): number | null {
  const currency = metaContent(html, "priceCurrency")?.toUpperCase() ?? null;
  if (currency && currency !== "JPY") return null;
  const raw = metaContent(html, "price");
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 100 && parsed <= 100_000_000 ? Math.round(parsed) : null;
}

function inferStockState(text: string): { state: ParsedStockState; confidence: number } {
  const normalized = text.toLowerCase();
  if (/売り切れ|売切れ|sold\s*out/.test(normalized)) return { state: "sold", confidence: 92 };
  if (/販売終了|取扱終了|お取り扱いできません|unavailable|discontinued/.test(normalized)) return { state: "unavailable", confidence: 90 };
  if (/在庫切れ|在庫なし|在庫がありません|out\s*of\s*stock/.test(normalized)) return { state: "out_of_stock", confidence: 90 };
  if (/残り\s*[1-5]\s*(?:点|台)|low\s*stock|残りわずか/.test(normalized)) return { state: "low_stock", confidence: 82 };
  if (/在庫あり|カートに入れる|今すぐ買う|購入する|add\s*to\s*cart|in\s*stock/.test(normalized)) return { state: "in_stock", confidence: 72 };
  return { state: "unknown", confidence: 0 };
}

function matchingProfile(sourceUrl: string): MerchantProfile | null {
  let hostname: string;
  try {
    hostname = new URL(sourceUrl).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
  return PROFILES.find((profile) => profile.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) ?? null;
}

export function merchantNameForUrl(sourceUrl: string): string | null {
  return matchingProfile(sourceUrl)?.merchant ?? null;
}

export function extractMerchantPageHints(html: string, sourceUrl: string): MerchantPageHints {
  const profile = matchingProfile(sourceUrl);
  if (!profile) {
    return {
      merchant: null,
      parserName: "generic",
      parserVersion: PARSER_VERSION,
      title: null,
      priceJpy: null,
      specText: null,
      stockState: "unknown",
      confidence: { title: 0, price: 0, specs: 0, stock: 0 },
    };
  }

  const scopedTitle = firstElementText(html, profile, "title");
  const title = scopedTitle ?? firstH1(html);
  const scopedPriceText = firstElementText(html, profile, "price");
  const priceJpy = (scopedPriceText ? numericPrice(scopedPriceText) : null) ?? structuredMetaPrice(html);
  const scopeText = allScopeText(html, profile);
  const fallbackVisible = stripMarkup(html.slice(0, 350_000), MAX_SCOPE_TEXT);
  const stock = inferStockState([scopeText, fallbackVisible].filter(Boolean).join(" \n "));

  return {
    merchant: profile.merchant,
    parserName: profile.parserName,
    parserVersion: PARSER_VERSION,
    title: title?.slice(0, 500) ?? null,
    priceJpy,
    specText: scopeText,
    stockState: stock.state,
    confidence: {
      title: scopedTitle ? 92 : title ? 72 : 0,
      price: scopedPriceText && priceJpy ? 90 : priceJpy ? 78 : 0,
      specs: scopeText ? 84 : 0,
      stock: stock.confidence,
    },
  };
}
