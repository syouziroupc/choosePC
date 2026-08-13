import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);

function argument(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const version = argument("--version", "knowledge-2026-08-13.2");
const gitSha = argument("--git-sha", process.env.GITHUB_SHA || "local");
const output = argument("--output");

const LEGACY_IDS = {
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

function quote(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite numeric seed value: ${value}`);
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function json(value) {
  return quote(JSON.stringify(value));
}

function manufacturer(label) {
  if (/^intel\b/i.test(label)) return "Intel";
  if (/^(amd|ryzen)\b/i.test(label)) return "AMD";
  if (/^(nvidia|geforce)\b/i.test(label)) return "NVIDIA";
  if (/^apple\b/i.test(label)) return "Apple";
  return "Unknown";
}

function gpuVariant(entry) {
  if (["desktop", "laptop", "integrated", "unknown"].includes(entry.variant)) return entry.variant;
  const text = `${entry.id} ${entry.label}`.toLowerCase();
  if (text.includes("laptop")) return "laptop";
  if (text.includes("uhd") || text.includes("iris") || text.includes("integrated")) return "integrated";
  if (text.includes("desktop")) return "desktop";
  return "unknown";
}

function stableIdentity(entry) {
  return { ...entry, id: LEGACY_IDS[entry.label] ?? entry.id };
}

async function loadCatalogDirectory(relativeDir) {
  const dir = join(root, relativeDir);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".json") && name !== "catalog.json").sort();
  const entries = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(join(dir, file), "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`Hardware catalog file must contain an array: ${relativeDir}/${file}`);
    entries.push(...parsed.map(stableIdentity));
  }
  return entries;
}

async function loadSources() {
  const dir = join(root, "knowledge", "sources");
  const files = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  const documents = [];
  for (const file of files) {
    const entries = JSON.parse(await readFile(join(dir, file), "utf8"));
    if (!Array.isArray(entries)) throw new Error(`Source file must contain an array: ${file}`);
    for (const entry of entries) documents.push({ ...entry, sourceFile: basename(file) });
  }
  return documents;
}

const cpus = await loadCatalogDirectory("knowledge/hardware/cpu");
const gpus = await loadCatalogDirectory("knowledge/hardware/gpu");
const sources = await loadSources();
const sourceById = new Map(sources.map((source) => [source.id, source]));

const lines = [
  "PRAGMA foreign_keys = ON;",
  "BEGIN TRANSACTION;",
  `INSERT INTO knowledge_versions (version, git_sha) VALUES (${quote(version)}, ${quote(gitSha)}) ON CONFLICT(version) DO UPDATE SET git_sha = excluded.git_sha;`,
];

for (const source of sources) {
  lines.push(`INSERT INTO source_documents (id, url, publisher, title, retrieved_at, license_note, content_hash) VALUES (${quote(source.id)}, ${quote(source.url)}, ${quote(source.publisher)}, ${quote(source.title ?? null)}, ${quote(source.retrievedAt)}, ${quote(source.licenseNote ?? null)}, ${quote(source.contentHash ?? null)}) ON CONFLICT(id) DO UPDATE SET url = excluded.url, publisher = excluded.publisher, title = excluded.title, retrieved_at = excluded.retrieved_at, license_note = excluded.license_note, content_hash = excluded.content_hash;`);
}

for (const cpu of cpus) {
  const provenance = {
    aliases: cpu.aliases ?? [],
    confidence: cpu.confidence,
    status: cpu.status,
    method: cpu.method,
    gaming: cpu.capabilities?.gaming ?? null,
    sources: cpu.sources ?? [],
  };
  lines.push(`INSERT INTO hardware_cpu (id, canonical_name, manufacturer, general_score, single_score, multi_score, efficiency_score, knowledge_version, source_json) VALUES (${quote(cpu.id)}, ${quote(cpu.label)}, ${quote(manufacturer(cpu.label))}, ${quote(cpu.capabilities?.general ?? null)}, ${quote(cpu.capabilities?.single ?? null)}, ${quote(cpu.capabilities?.multi ?? null)}, ${quote(cpu.capabilities?.efficiency ?? null)}, ${quote(version)}, ${json(provenance)}) ON CONFLICT(id) DO UPDATE SET canonical_name = excluded.canonical_name, manufacturer = excluded.manufacturer, general_score = excluded.general_score, single_score = excluded.single_score, multi_score = excluded.multi_score, efficiency_score = excluded.efficiency_score, knowledge_version = excluded.knowledge_version, source_json = excluded.source_json;`);

  for (const sourceId of cpu.sources ?? []) {
    const source = sourceById.get(sourceId);
    if (!source) throw new Error(`CPU ${cpu.id} references missing source ${sourceId}`);
    lines.push(`INSERT INTO knowledge_evidence (knowledge_type, knowledge_id, field_name, source_document_id, evidence_kind, confidence, metadata_json) VALUES ('cpu', ${quote(cpu.id)}, 'catalog', ${quote(sourceId)}, 'official_docs', ${quote(source.confidence ?? 100)}, ${json({ status: cpu.status ?? "unknown", method: cpu.method ?? null })}) ON CONFLICT(knowledge_type, knowledge_id, field_name, source_document_id) DO UPDATE SET evidence_kind = excluded.evidence_kind, confidence = excluded.confidence, metadata_json = excluded.metadata_json;`);
  }
}

for (const gpu of gpus) {
  const fixedVramMb = Array.isArray(gpu.vramOptionsGb) && gpu.vramOptionsGb.length === 1 ? Math.round(gpu.vramOptionsGb[0] * 1024) : null;
  const provenance = {
    aliases: gpu.aliases ?? [],
    confidence: gpu.confidence,
    status: gpu.status,
    method: gpu.method,
    tgpRangeW: gpu.tgpRangeW ?? null,
    vramOptionsGb: gpu.vramOptionsGb ?? null,
    rayTracing: gpu.capabilities?.rayTracing ?? null,
    sources: gpu.sources ?? [],
  };
  lines.push(`INSERT INTO hardware_gpu (id, canonical_name, manufacturer, variant, vram_mb, score_1080, score_1440, score_4k, compute_score, knowledge_version, source_json) VALUES (${quote(gpu.id)}, ${quote(gpu.label)}, ${quote(manufacturer(gpu.label))}, ${quote(gpuVariant(gpu))}, ${quote(fixedVramMb)}, ${quote(gpu.capabilities?.gaming1080 ?? null)}, ${quote(gpu.capabilities?.gaming1440 ?? null)}, ${quote(gpu.capabilities?.gaming4k ?? null)}, ${quote(gpu.capabilities?.compute ?? null)}, ${quote(version)}, ${json(provenance)}) ON CONFLICT(id) DO UPDATE SET canonical_name = excluded.canonical_name, manufacturer = excluded.manufacturer, variant = excluded.variant, vram_mb = excluded.vram_mb, score_1080 = excluded.score_1080, score_1440 = excluded.score_1440, score_4k = excluded.score_4k, compute_score = excluded.compute_score, knowledge_version = excluded.knowledge_version, source_json = excluded.source_json;`);

  for (const sourceId of gpu.sources ?? []) {
    const source = sourceById.get(sourceId);
    if (!source) throw new Error(`GPU ${gpu.id} references missing source ${sourceId}`);
    lines.push(`INSERT INTO knowledge_evidence (knowledge_type, knowledge_id, field_name, source_document_id, evidence_kind, confidence, metadata_json) VALUES ('gpu', ${quote(gpu.id)}, 'catalog', ${quote(sourceId)}, 'official_docs', ${quote(source.confidence ?? 100)}, ${json({ status: gpu.status ?? "unknown", method: gpu.method ?? null, tgpRangeW: gpu.tgpRangeW ?? null, vramOptionsGb: gpu.vramOptionsGb ?? null })}) ON CONFLICT(knowledge_type, knowledge_id, field_name, source_document_id) DO UPDATE SET evidence_kind = excluded.evidence_kind, confidence = excluded.confidence, metadata_json = excluded.metadata_json;`);
  }
}

lines.push("COMMIT;", "");
const sql = lines.join("\n");

if (output) {
  await writeFile(output, sql, "utf8");
  console.log(`Wrote ${output}: ${cpus.length} CPUs, ${gpus.length} GPUs, ${sources.length} source documents.`);
} else {
  process.stdout.write(sql);
}
