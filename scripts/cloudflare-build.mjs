import { spawnSync } from "node:child_process";

const RELEASE_BRANCH = "release/force-production-v5-once";
const EXPECTED_VERSION = "2026-08-18-static-frontend-v4";
const PRODUCTION_ORIGIN = "https://choosepc.syouziroupc.workers.dev";
const ACCOUNT_ID = "7cea58251b35319648343e0dd9f7cb76";
const API_ROOT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function productionMatches(maxAttempts = 4) {
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
      console.log(`production verify ${attempt}: root=${root.status} meta=${metadata.status} health=${health.status} matched=${matched}`);
      if (matched) return true;
    } catch (error) {
      console.log(`production verify ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return false;
}

async function cloudflareApi(path, init = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("Workers Builds did not expose CLOUDFLARE_API_TOKEN to the build command");
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const errors = Array.isArray(payload?.errors) ? payload.errors.map((item) => item?.message ?? item?.code).join("; ") : `HTTP ${response.status}`;
    throw new Error(`Cloudflare Builds API failed for ${path}: ${errors}`);
  }
  return payload?.result;
}

async function triggerProductionBuild() {
  const workers = await cloudflareApi("/builds/workers");
  if (!Array.isArray(workers)) throw new Error("Cloudflare Builds workers response was not an array");
  const worker = workers.find((item) => item?.name === "choosepc");
  if (!worker) throw new Error("choosepc was not found in Cloudflare Builds workers list");
  const workerTag = worker.tag ?? worker.external_script_id ?? worker.id;
  if (!workerTag) throw new Error("choosepc Workers Builds tag was missing");

  const triggers = await cloudflareApi(`/builds/workers/${encodeURIComponent(workerTag)}/triggers`);
  if (!Array.isArray(triggers) || triggers.length === 0) throw new Error("No Workers Builds trigger exists for choosepc");

  const productionTrigger = triggers.find((trigger) => {
    const includes = Array.isArray(trigger?.branch_includes) ? trigger.branch_includes : [];
    return includes.some((branch) => branch && branch !== "*");
  });
  if (!productionTrigger?.trigger_uuid) {
    const summary = triggers.map((trigger) => ({ name: trigger?.trigger_name, includes: trigger?.branch_includes, excludes: trigger?.branch_excludes }));
    throw new Error(`No explicit production trigger found: ${JSON.stringify(summary)}`);
  }

  const includes = productionTrigger.branch_includes.filter((branch) => branch && branch !== "*");
  const branch = includes.includes("main") ? "main" : includes.includes("cloudflare-production") ? "cloudflare-production" : includes[0];
  if (!branch) throw new Error("Production trigger has no usable branch");

  console.log(`Triggering Cloudflare production build: trigger=${productionTrigger.trigger_name ?? productionTrigger.trigger_uuid} branch=${branch}`);
  const build = await cloudflareApi(`/builds/triggers/${encodeURIComponent(productionTrigger.trigger_uuid)}/builds`, {
    method: "POST",
    body: JSON.stringify({ branch }),
  });
  console.log(`Cloudflare production build accepted: branch=${branch} build=${build?.build_uuid ?? "unknown"} status=${build?.status ?? "unknown"}`);
}

run("npx", ["vite", "build"]);

const inWorkersBuild = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH ?? "";
console.log(`Workers Builds context: enabled=${inWorkersBuild} branch=${branch || "(none)"}`);

if (inWorkersBuild && branch === RELEASE_BRANCH) {
  console.log("One-shot recovery branch detected. First attempting an authenticated active Worker deployment.");
  run("npx", ["wrangler", "deploy"], { CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID });
  if (await productionMatches()) {
    console.log(`Active production verified at ${EXPECTED_VERSION}.`);
  } else {
    console.log("Direct deployment did not change Active Deployment. Triggering the configured Workers Builds production trigger instead.");
    await triggerProductionBuild();
  }
}
