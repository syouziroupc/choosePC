import { readFileSync, readdirSync } from "node:fs";
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

function countJsonEntries(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .reduce((sum, name) => {
      const value = JSON.parse(readFileSync(join(directory, name), "utf8"));
      return sum + (Array.isArray(value) ? value.length : 1);
    }, 0);
}

const source = readFileSync("apps/worker/src/api-entry.ts", "utf8");
const apiVersion = source.match(/const API_VERSION = "([^"]+)";/)?.[1];
if (!apiVersion) throw new Error("API_VERSION was not found in api-entry.ts");
const expectedCpuCount = countJsonEntries("knowledge/hardware/cpu");
const expectedGpuCount = countJsonEntries("knowledge/hardware/gpu");

console.log(`[active-deploy] main Workers Build detected; deploying ${apiVersion} to active choosepc service`);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const deploy = spawnSync(npx, ["wrangler", "deploy", "--config", "wrangler.jsonc", "--keep-vars"], {
  stdio: "inherit",
  env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
});
if (deploy.error) throw deploy.error;
if (deploy.status !== 0) throw new Error(`wrangler deploy failed with status ${deploy.status}`);

for (let attempt = 1; attempt <= 24; attempt += 1) {
  const suffix = `${process.env.WORKERS_CI_COMMIT_SHA ?? "main"}-${attempt}`;
  try {
    const [root, metadata, health, catalog] = await Promise.all([
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
    ]);

    const [rootText, metadataJson, healthJson, catalogJson] = await Promise.all([
      root.text(),
      metadata.json().catch(() => null),
      health.json().catch(() => null),
      catalog.json().catch(() => null),
    ]);
    const cpuCount = Array.isArray(catalogJson?.cpus) ? catalogJson.cpus.length : -1;
    const gpuCount = Array.isArray(catalogJson?.gpus) ? catalogJson.gpus.length : -1;
    const cors = health.headers.get("access-control-allow-origin");
    const matched = root.ok
      && metadata.ok
      && health.ok
      && catalog.ok
      && rootText.includes("choosePC Operations")
      && metadataJson?.apiVersion === apiVersion
      && healthJson?.apiVersion === apiVersion
      && metadataJson?.publicUiHostedHere === false
      && cpuCount === expectedCpuCount
      && gpuCount === expectedGpuCount
      && cors === FRONTEND_ORIGIN;

    console.log(`[active-deploy] verify ${attempt}: root=${root.status} meta=${metadata.status} health=${health.status} catalog=${catalog.status} cpu=${cpuCount} gpu=${gpuCount} cors=${cors ?? "-"} matched=${matched}`);
    if (matched) {
      console.log(`[active-deploy] production verified: ${apiVersion}, CPUs=${cpuCount}, GPUs=${gpuCount}`);
      process.exit(0);
    }
  } catch (error) {
    console.log(`[active-deploy] verify ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

throw new Error(`Active production did not converge to ${apiVersion}`);
