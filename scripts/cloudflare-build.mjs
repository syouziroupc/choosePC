import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const RELEASE_BRANCH = "release/force-production-v5-once";
const EXPECTED_VERSION = "2026-08-18-static-frontend-v4";
const PRODUCTION_ORIGIN = "https://choosepc.syouziroupc.workers.dev";
const ACCOUNT_ID = "7cea58251b35319648343e0dd9f7cb76";
const API_ROOT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;

function runRequired(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runAttempt(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });
  return {
    status: result.status,
    error: result.error instanceof Error ? result.error.message : result.error ? String(result.error) : null,
  };
}

async function productionMatches(maxAttempts = 3) {
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
      if (matched) return { matched: true, root: root.status, metadata: metadata.status, health: health.status };
      if (attempt === maxAttempts) return { matched: false, root: root.status, metadata: metadata.status, health: health.status };
    } catch (error) {
      if (attempt === maxAttempts) return { matched: false, error: error instanceof Error ? error.message : String(error) };
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return { matched: false };
}

async function cloudflareApi(path, init = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not exposed to the build command");
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
    const errors = Array.isArray(payload?.errors)
      ? payload.errors.map((item) => item?.message ?? item?.code).join("; ")
      : `HTTP ${response.status}`;
    throw new Error(`${path}: ${errors}`);
  }
  return payload?.result;
}

async function inspectAndTriggerProduction() {
  const diagnostic = { apiTokenPresent: Boolean(process.env.CLOUDFLARE_API_TOKEN) };
  try {
    const workers = await cloudflareApi("/builds/workers");
    diagnostic.workerCount = Array.isArray(workers) ? workers.length : null;
    const worker = Array.isArray(workers) ? workers.find((item) => item?.name === "choosepc") : null;
    const workerTag = worker?.tag ?? worker?.external_script_id ?? worker?.id;
    diagnostic.workerFound = Boolean(worker);
    diagnostic.workerTag = workerTag ?? null;
    if (!workerTag) throw new Error("choosepc Workers Builds tag was not found");

    const triggers = await cloudflareApi(`/builds/workers/${encodeURIComponent(workerTag)}/triggers`);
    diagnostic.triggers = Array.isArray(triggers)
      ? triggers.map((trigger) => ({
          name: trigger?.trigger_name ?? null,
          uuid: trigger?.trigger_uuid ?? null,
          includes: trigger?.branch_includes ?? null,
          excludes: trigger?.branch_excludes ?? null,
          deployCommand: trigger?.deploy_command ?? null,
          rootDirectory: trigger?.root_directory ?? null,
        }))
      : null;

    const productionTrigger = Array.isArray(triggers) ? triggers.find((trigger) => {
      const includes = Array.isArray(trigger?.branch_includes) ? trigger.branch_includes : [];
      return includes.some((candidate) => candidate && candidate !== "*");
    }) : null;
    if (!productionTrigger?.trigger_uuid) throw new Error("No explicit production trigger was found");

    const includes = productionTrigger.branch_includes.filter((candidate) => candidate && candidate !== "*");
    const productionBranch = includes.includes("main")
      ? "main"
      : includes.includes("cloudflare-production")
        ? "cloudflare-production"
        : includes[0];
    if (!productionBranch) throw new Error("Production trigger has no usable branch");

    diagnostic.selectedProductionBranch = productionBranch;
    const build = await cloudflareApi(`/builds/triggers/${encodeURIComponent(productionTrigger.trigger_uuid)}/builds`, {
      method: "POST",
      body: JSON.stringify({ branch: productionBranch }),
    });
    diagnostic.triggerAccepted = true;
    diagnostic.triggeredBuildUuid = build?.build_uuid ?? null;
    diagnostic.triggeredBuildStatus = build?.status ?? null;
  } catch (error) {
    diagnostic.triggerAccepted = false;
    diagnostic.apiError = error instanceof Error ? error.message : String(error);
  }
  return diagnostic;
}

function publishDiagnostic(diagnostic) {
  const text = `${JSON.stringify(diagnostic, null, 2)}\n`;
  mkdirSync("dist/client", { recursive: true });
  mkdirSync("dist/client/pc-check", { recursive: true });
  writeFileSync("dist/client/cloudflare-recovery.json", text, "utf8");
  writeFileSync("dist/client/pc-check/cloudflare-recovery.json", text, "utf8");
  console.log(`Recovery diagnostic published (secret values omitted): ${JSON.stringify(diagnostic)}`);
}

runRequired("npx", ["vite", "build"]);

const inWorkersBuild = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH ?? "";
console.log(`Workers Builds context: enabled=${inWorkersBuild} branch=${branch || "(none)"}`);

if (inWorkersBuild && branch === RELEASE_BRANCH) {
  const diagnostic = {
    at: new Date().toISOString(),
    branch,
    commit: process.env.WORKERS_CI_COMMIT_SHA ?? null,
    expectedVersion: EXPECTED_VERSION,
    directDeploy: null,
    liveAfterDirectDeploy: null,
    buildsApi: null,
  };

  diagnostic.directDeploy = runAttempt("npx", ["wrangler", "deploy"], { CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID });
  diagnostic.liveAfterDirectDeploy = await productionMatches();
  if (!diagnostic.liveAfterDirectDeploy.matched) {
    diagnostic.buildsApi = await inspectAndTriggerProduction();
  }
  publishDiagnostic(diagnostic);
}
