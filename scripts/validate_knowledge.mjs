import { readdir, readFile } from "node:fs/promises";

const root = new URL("../knowledge/", import.meta.url);
const ids = new Map();
const objects = [];
const hardwareAliases = new Map();
let files = 0;
let cpuCount = 0;
let gpuCount = 0;

const CPU_MINIMUM = 200;
const GPU_MINIMUM = 120;
const scoreKeys = {
  cpu: ["general", "single", "multi", "gaming"],
  gpu: ["gaming1080", "gaming1440", "gaming4k", "compute"],
};

function hardwareKind(path) {
  if (/\/knowledge\/hardware\/cpu\/[^/]+\.json$/.test(path)) return "cpu";
  if (/\/knowledge\/hardware\/gpu\/[^/]+\.json$/.test(path)) return "gpu";
  return null;
}

function normalizedAlias(value) {
  return String(value).toLowerCase().replace(/[®™]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function validateHardwareEntry(object, path, kind) {
  if (typeof object.id !== "string" || !object.id.trim()) throw new Error(`Hardware entry requires id: ${path}`);
  if (typeof object.label !== "string" || !object.label.trim()) throw new Error(`Hardware entry requires label: ${path}#${object.id}`);
  if (!Array.isArray(object.aliases) || object.aliases.length === 0) throw new Error(`Hardware entry requires aliases: ${path}#${object.id}`);
  if (!object.capabilities || typeof object.capabilities !== "object") throw new Error(`Hardware entry requires capabilities: ${path}#${object.id}`);
  for (const key of scoreKeys[kind]) {
    const value = object.capabilities[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`Hardware capability ${key} must be 0..100: ${path}#${object.id}`);
    }
  }
  for (const [key, value] of Object.entries(object.capabilities)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`Hardware capability ${key} must be 0..100: ${path}#${object.id}`);
    }
  }
  if (!Array.isArray(object.sources) || object.sources.length === 0) {
    throw new Error(`Hardware entry requires at least one source: ${path}#${object.id}`);
  }
  if (typeof object.method !== "string" || !object.method.trim()) {
    throw new Error(`Hardware entry requires a scoring method: ${path}#${object.id}`);
  }
  for (const alias of object.aliases) {
    if (typeof alias !== "string" || normalizedAlias(alias).length < 2) throw new Error(`Invalid hardware alias: ${path}#${object.id}`);
    const normalized = normalizedAlias(alias);
    const previous = hardwareAliases.get(`${kind}:${normalized}`);
    if (previous && previous !== object.id) {
      throw new Error(`Duplicate ${kind} alias '${alias}' for ${previous} and ${object.id}`);
    }
    hardwareAliases.set(`${kind}:${normalized}`, object.id);
  }
  if (kind === "gpu") {
    if (object.variant != null && !["desktop", "laptop", "integrated", "unknown"].includes(object.variant)) {
      throw new Error(`Invalid GPU variant: ${path}#${object.id}`);
    }
    if (object.vramOptionsGb != null) {
      if (!Array.isArray(object.vramOptionsGb) || object.vramOptionsGb.length === 0 || object.vramOptionsGb.some((value) => typeof value !== "number" || value <= 0 || value > 128)) {
        throw new Error(`Invalid GPU VRAM options: ${path}#${object.id}`);
      }
      const unique = new Set(object.vramOptionsGb);
      if (unique.size !== object.vramOptionsGb.length) throw new Error(`Duplicate GPU VRAM option: ${path}#${object.id}`);
    }
    if (object.tgpRangeW != null) {
      if (!Array.isArray(object.tgpRangeW) || object.tgpRangeW.length !== 2 || object.tgpRangeW.some((value) => typeof value !== "number" || value <= 0 || value > 1000) || object.tgpRangeW[0] > object.tgpRangeW[1]) {
        throw new Error(`Invalid GPU TGP range: ${path}#${object.id}`);
      }
    }
  }
  if (object.status === "verified") {
    if (!Array.isArray(object.sources) || object.sources.length === 0) {
      throw new Error(`Verified hardware capability entry requires explicit sources: ${path}#${object.id}`);
    }
    if (/internal-relative-index|vendor-spec-tier-relative-index/i.test(object.method)) {
      throw new Error(`Relative indices cannot be promoted to verified without an external/reproducible calibration method: ${path}#${object.id}`);
    }
    if (typeof object.confidence !== "number" || object.confidence < 80) {
      throw new Error(`Verified hardware capability entry requires confidence >= 80: ${path}#${object.id}`);
    }
  }
}

async function walk(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
    if (entry.isDirectory()) {
      await walk(child);
      continue;
    }
    if (!entry.name.endsWith(".json")) continue;
    files += 1;
    const text = await readFile(child, "utf8");
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON: ${child.pathname}: ${error}`);
    }
    for (const object of Array.isArray(data) ? data : [data]) {
      if (!object || typeof object !== "object") throw new Error(`Knowledge entry must be an object: ${child.pathname}`);
      objects.push({ object, path: child.pathname });
      if ("id" in object && typeof object.id === "string") {
        const previous = ids.get(object.id);
        if (previous) throw new Error(`Duplicate knowledge id '${object.id}' in ${previous} and ${child.pathname}`);
        ids.set(object.id, child.pathname);
      }
      if ("confidence" in object && (typeof object.confidence !== "number" || object.confidence < 0 || object.confidence > 100)) {
        throw new Error(`confidence must be 0..100: ${child.pathname}`);
      }
      if ("status" in object && !["draft", "provisional", "verified", "template-only"].includes(object.status)) {
        throw new Error(`Unsupported knowledge status '${object.status}': ${child.pathname}`);
      }
      if (object.status === "verified" && (!Array.isArray(object.sources) || object.sources.length === 0) && !object.url) {
        throw new Error(`Verified knowledge must carry source evidence: ${child.pathname}`);
      }
      const kind = hardwareKind(child.pathname);
      if (kind) {
        validateHardwareEntry(object, child.pathname, kind);
        if (kind === "cpu") cpuCount += 1;
        else gpuCount += 1;
      }
    }
  }
}

await walk(root);

for (const { object, path } of objects) {
  if (!Array.isArray(object.sources)) continue;
  for (const sourceId of object.sources) {
    if (typeof sourceId !== "string") throw new Error(`source id must be a string: ${path}`);
    if (!ids.has(sourceId)) throw new Error(`Unknown source reference '${sourceId}' in ${path}`);
  }
}

if (cpuCount < CPU_MINIMUM) throw new Error(`CPU knowledge coverage regressed: ${cpuCount} < ${CPU_MINIMUM}`);
if (gpuCount < GPU_MINIMUM) throw new Error(`GPU knowledge coverage regressed: ${gpuCount} < ${GPU_MINIMUM}`);

console.log(`Knowledge validation passed: ${files} JSON file(s), ${ids.size} unique id(s), ${cpuCount} CPUs, ${gpuCount} GPUs.`);
