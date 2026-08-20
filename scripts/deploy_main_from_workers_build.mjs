import { readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ACCOUNT_ID = "7cea58251b35319648343e0dd9f7cb76";
const PRODUCTION_ORIGIN = "https://choosepc.syouziroupc.workers.dev";
const FRONTEND_ORIGIN = "https://www.szpc.jp";

const inWorkersBuild = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH ?? "";

if (!inWorkersBuild || branch !== "main") {
  console.log(`[active-deploy] skipped: workersCi=${inWorkersBuild} branch=${branch || "(none)"}`);
  process.exit(0);
}

const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim() : "";
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return options.capture ? String(result.stdout ?? "") : "";
}

function countJsonEntries(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .reduce((sum, name) => {
      const value = JSON.parse(readFileSync(join(directory, name), "utf8"));
      return sum + (Array.isArray(value) ? value.length : 1);
    }, 0);
}

function parseJsonOutput(text) {
  const trimmed = text.trim();
  const starts = [trimmed.indexOf("["), trimmed.indexOf("{")].filter((value) => value >= 0);
  if (!starts.length) throw new Error(`No JSON found in Wrangler output: ${trimmed.slice(0, 300)}`);
  return JSON.parse(trimmed.slice(Math.min(...starts)));
}

const source = readFileSync("apps/worker/src/api-entry.ts", "utf8");
const apiVersion = source.match(/const API_VERSION = "([^"]+)";/)?.[1];
if (!apiVersion) throw new Error("API_VERSION was not found in api-entry.ts");
const expectedCpuCount = countJsonEntries("knowledge/hardware/cpu");
const expectedGpuCount = countJsonEntries("knowledge/hardware/gpu");
const wrangler = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const dbBinding = Array.isArray(wrangler.d1_databases)
  ? wrangler.d1_databases.find((item) => item?.binding === "DB")
  : null;
if (!dbBinding?.database_name || !dbBinding?.database_id) {
  throw new Error("Production DB binding is missing from wrangler.jsonc");
}

console.log(`[active-deploy] main Workers Build: migrate/seed ${dbBinding.database_name}, then deploy ${apiVersion}`);
run(npx, ["wrangler", "d1", "migrations", "apply", dbBinding.database_name, "--remote", "--config", "wrangler.jsonc"]);

const seedPath = "/tmp/choosepc-main-knowledge-seed.sql";
try {
  run(process.execPath, [
    "scripts/build_d1_knowledge_seed.mjs",
    "--git-sha", process.env.WORKERS_CI_COMMIT_SHA ?? "workers-build-main",
    "--output", seedPath,
  ]);
  run(npx, [
    "wrangler", "d1", "execute", dbBinding.database_name,
    "--remote", `--file=${seedPath}`, "--yes", "--config", "wrangler.jsonc",
  ]);
} finally {
  rmSync(seedPath, { force: true });
}

const countOutput = run(npx, [
  "wrangler", "d1", "execute", dbBinding.database_name,
  "--remote", "--json", "--config", "wrangler.jsonc",
  "--command", "SELECT (SELECT COUNT(*) FROM hardware_cpu) AS cpu_count, (SELECT COUNT(*) FROM hardware_gpu) AS gpu_count;",
], { capture: true });
const countPayload = parseJsonOutput(countOutput);
const countRows = Array.isArray(countPayload) ? countPayload.flatMap((item) => item?.results ?? []) : [];
const dbCounts = countRows[0] ?? {};
if (Number(dbCounts.cpu_count) !== expectedCpuCount || Number(dbCounts.gpu_count) !== expectedGpuCount) {
  throw new Error(`D1 seed mismatch: cpu=${dbCounts.cpu_count}/${expectedCpuCount}, gpu=${dbCounts.gpu_count}/${expectedGpuCount}`);
}

run(npx, ["wrangler", "deploy", "--config", "wrangler.jsonc", "--keep-vars"]);

for (let attempt = 1; attempt <= 24; attempt += 1) {
  const suffix = `${process.env.WORKERS_CI_COMMIT_SHA ?? "main"}-${attempt}`;
  try {
    const [root, metadata, health, catalog, affiliate] = await Promise.all([
      fetch(`${PRODUCTION_ORIGIN}/?deploy=${suffix}`, { headers: { "cache-control": "no-cache" } }),
      fetch(`${PRODUCTION_ORIGIN}/api/v1?deploy=${suffix}`, {
        headers: { "cache-control": "no-cache", origin: FRONTEND_ORIGIN },
      }),
      fetch(`${PRODUCTION_ORIGIN}/api/v1/health?deploy=${suffix}`, {
        headers: { "cache-control": "no-cache", origin: FRONTEND_ORIGIN },
      }),
      fetch(`${PRODUCTION_ORIGIN}/api/v1/catalog?deploy=${suffix}`, {
        headers: { "cache-control": "no-cache", origin: FRONTEND_ORIGIN },
      }),
      fetch(`${PRODUCTION_ORIGIN}/api/v1/affiliate/status?deploy=${suffix}`, {
        headers: { "cache-control": "no-cache", origin: FRONTEND_ORIGIN },
      }),
    ]);

    const [rootText, metadataJson, healthJson, catalogJson, affiliateJson] = await Promise.all([
      root.text(),
      metadata.json().catch(() => null),
      health.json().catch(() => null),
      catalog.json().catch(() => null),
      affiliate.json().catch(() => null),
    ]);
    const cpuCount = Array.isArray(catalogJson?.cpus) ? catalogJson.cpus.length : -1;
    const gpuCount = Array.isArray(catalogJson?.gpus) ? catalogJson.gpus.length : -1;
    const cors = health.headers.get("access-control-allow-origin");
    const affiliateCors = affiliate.headers.get("access-control-allow-origin");
    const affiliateStateValid = affiliateJson?.state === "awaiting-a8-program-link" || affiliateJson?.state === "ready";
    const matched = root.ok
      && metadata.ok
      && health.ok
      && catalog.ok
      && affiliate.ok
      && rootText.includes("choosePC Operations")
      && metadataJson?.apiVersion === apiVersion
      && healthJson?.apiVersion === apiVersion
      && metadataJson?.selectedAffiliateNetwork === "a8"
      && healthJson?.selectedAffiliateNetwork === "a8"
      && affiliateJson?.network?.id === "a8"
      && affiliateJson?.network?.name === "A8.net"
      && affiliateJson?.network?.selected === true
      && affiliateJson?.persistenceConfigured === true
      && affiliateStateValid
      && metadataJson?.publicUiHostedHere === false
      && metadataJson?.persistenceConfigured === true
      && healthJson?.persistenceConfigured === true
      && cpuCount === expectedCpuCount
      && gpuCount === expectedGpuCount
      && cors === FRONTEND_ORIGIN
      && affiliateCors === FRONTEND_ORIGIN;

    console.log(`[active-deploy] verify ${attempt}: root=${root.status} meta=${metadata.status} health=${health.status} catalog=${catalog.status} affiliate=${affiliate.status}/${affiliateJson?.state ?? "-"} db=${healthJson?.persistenceConfigured} cpu=${cpuCount} gpu=${gpuCount} cors=${cors ?? "-"}/${affiliateCors ?? "-"} matched=${matched}`);
    if (matched) {
      console.log(`[active-deploy] production verified: ${apiVersion}, A8=${affiliateJson.state}, D1=${dbBinding.database_id}, CPUs=${cpuCount}, GPUs=${gpuCount}`);
      process.exit(0);
    }
  } catch (error) {
    console.log(`[active-deploy] verify ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

throw new Error(`Active production did not converge to ${apiVersion} with D1 persistence and A8 readiness API`);
