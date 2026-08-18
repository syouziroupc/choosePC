import { spawnSync } from "node:child_process";

const expectedBranch = "release/force-workers-build-deploy-v4";
const workersCi = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH ?? "";

if (!workersCi || branch !== expectedBranch) {
  console.log(`[force-production] skipped: WORKERS_CI=${process.env.WORKERS_CI ?? ""} branch=${branch}`);
  process.exit(0);
}

console.log(`[force-production] deploying choosepc from Cloudflare Workers Builds branch ${branch}`);
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
