import { spawnSync } from "node:child_process";

const ACCOUNT_ID = "7cea58251b35319648343e0dd9f7cb76";
const inWorkersBuild = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH ?? "";

if (!inWorkersBuild || branch !== "main") {
  console.log(`[inoso-deploy] skipped: workersCi=${inWorkersBuild} branch=${branch || "(none)"}`);
  process.exit(0);
}

const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };
delete env.WRANGLER_CI_OVERRIDE_NAME;
delete env.WRANGLER_CI_OVERRIDE_CONFIG_PATH;

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, ["wrangler", "deploy", "--config", "wrangler.inoso.jsonc", "--keep-vars"], {
  encoding: "utf8",
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`INOSO auxiliary Worker deployment failed with status ${result.status}`);
}

console.log("[inoso-deploy] auxiliary Worker and routes deployed");
