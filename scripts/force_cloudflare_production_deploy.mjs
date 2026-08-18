import { spawnSync } from "node:child_process";

const workersCi = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH ?? "";

if (!workersCi) {
  console.log(`[force-production] skipped outside Cloudflare Workers Builds: branch=${branch}`);
  process.exit(0);
}

console.log(`[force-production] deploying choosepc from Cloudflare Workers Builds branch ${branch || "unknown"}`);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, ["wrangler", "deploy", "--keep-vars"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  console.error(`[force-production] wrangler deploy failed with status ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log("[force-production] active deployment command completed");
