import { readdir, readFile } from "node:fs/promises";

const root = new URL("../knowledge/", import.meta.url);
const ids = new Map();
const objects = [];
let files = 0;

function isHardwareCatalog(path) {
  return /\/knowledge\/hardware\/(?:cpu|gpu)\/catalog\.json$/.test(path);
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
      if (isHardwareCatalog(child.pathname) && object.status === "verified") {
        if (!Array.isArray(object.sources) || object.sources.length === 0) {
          throw new Error(`Verified hardware capability entry requires explicit sources: ${child.pathname}#${object.id ?? "unknown"}`);
        }
        if (typeof object.method !== "string" || !object.method.trim()) {
          throw new Error(`Verified hardware capability entry requires a calibration method: ${child.pathname}#${object.id ?? "unknown"}`);
        }
        if (/internal-relative-index/i.test(object.method)) {
          throw new Error(`Internal relative indices cannot be promoted to verified without an external/reproducible calibration method: ${child.pathname}#${object.id ?? "unknown"}`);
        }
        if (typeof object.confidence !== "number" || object.confidence < 80) {
          throw new Error(`Verified hardware capability entry requires confidence >= 80: ${child.pathname}#${object.id ?? "unknown"}`);
        }
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

console.log(`Knowledge validation passed: ${files} JSON file(s), ${ids.size} unique id(s).`);
