import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const workersCi = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH ?? "";

if (!workersCi) {
  console.log(`[force-production] skipped outside Cloudflare Workers Builds: branch=${branch}`);
  process.exit(0);
}

const generatedRedirect = resolve(".wrangler/deploy/config.json");
if (existsSync(generatedRedirect)) {
  rmSync(generatedRedirect, { force: true });
  console.log(`[force-production] removed generated Wrangler redirect: ${generatedRedirect}`);
} else {
  console.log("[force-production] generated Wrangler redirect was not present");
}

console.log(`[force-production] deploying API-only choosepc from wrangler.jsonc; branch=${branch || "unknown"}`);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, ["wrangler", "deploy", "--config", "wrangler.jsonc", "--keep-vars"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  console.error(`[force-production] wrangler deploy failed with status ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log("[force-production] API-only active deployment completed; generated redirect remains removed for the Cloudflare deploy step");
