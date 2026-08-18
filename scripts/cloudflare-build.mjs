import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const RELEASE_BRANCH = "release/force-production-v5-once";
const EXPECTED_VERSION = "2026-08-18-static-frontend-v4";
const PRODUCTION_ORIGIN = "https://choosepc.syouziroupc.workers.dev";
const ACCOUNT_ID = "7cea58251b35319648343e0dd9f7cb76";

function runRequired(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function verifyActiveProduction(maxAttempts = 24) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const cacheBust = `${process.env.WORKERS_CI_COMMIT_SHA ?? "manual"}-${attempt}`;
    try {
      const [root, metadata, health] = await Promise.all([
        fetch(`${PRODUCTION_ORIGIN}/?release=${cacheBust}`, { headers: { "cache-control": "no-cache" } }),
        fetch(`${PRODUCTION_ORIGIN}/api/v1?release=${cacheBust}`, { headers: { "cache-control": "no-cache" } }),
        fetch(`${PRODUCTION_ORIGIN}/api/v1/health?release=${cacheBust}`, { headers: { "cache-control": "no-cache" } }),
      ]);
      const [rootText, metadataText, healthText] = await Promise.all([root.text(), metadata.text(), health.text()]);
      const matched = root.ok
        && metadata.ok
        && health.ok
        && rootText.includes("choosePC Operations")
        && metadataText.includes(EXPECTED_VERSION)
        && healthText.includes(EXPECTED_VERSION);
      console.log(`active production verify ${attempt}: root=${root.status} meta=${metadata.status} health=${health.status} matched=${matched}`);
      if (matched) return true;
    } catch (error) {
      console.log(`active production verify ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}

runRequired("npx", ["vite", "build"]);

const inWorkersBuild = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH ?? "";
console.log(`Workers Builds context: enabled=${inWorkersBuild} branch=${branch || "(none)"}`);

if (inWorkersBuild && branch === RELEASE_BRANCH) {
  const generatedRedirect = resolve(".wrangler/deploy/config.json");
  if (existsSync(generatedRedirect)) {
    rmSync(generatedRedirect, { force: true });
    console.log("Removed Vite-generated Wrangler redirect before active production deployment.");
  }

  console.log("Deploying the API/Ops Worker from the original wrangler.jsonc to Active Deployment.");
  runRequired(
    "npx",
    ["wrangler", "deploy", "--config", "wrangler.jsonc", "--keep-vars"],
    { CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
  );

  if (!await verifyActiveProduction()) {
    throw new Error(`Active production did not converge to Ops/API Worker ${EXPECTED_VERSION}`);
  }
  console.log(`Active production verified: ${EXPECTED_VERSION} with choosePC Operations at root.`);
}
