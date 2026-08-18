import {
  createCipheriv,
  publicEncrypt,
  randomBytes,
  constants as cryptoConstants,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const TARGET_BRANCH = "ops/provision-d1-affiliate-ready";
const ACCOUNT_ID = "7cea58251b35319648343e0dd9f7cb76";
const DB_NAME = "choosepc-production";
const PRODUCTION_ORIGIN = "https://choosepc.syouziroupc.workers.dev";
const FRONTEND_ORIGIN = "https://www.szpc.jp";
const REQUIRED_SECRETS = [
  "MARKET_INGEST_TOKEN",
  "OFFER_INGEST_TOKEN",
  "COMMERCIAL_ADMIN_TOKEN",
  "CONVERSION_IMPORT_TOKEN",
];
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA1kXujbMgqu5IZj8zQPEx
fqJmNv/O3V3YieGd++jIslbHYwvPtw3+QqBi/Vkdr8VeG7oCkMf1ZN+a+YYyCYZB
9sQRcJFBMH2rPKlaXwFCGDm/e+GuSD/c0mV2nckZuZSUnJQ6aWfUY1MjPyQZMbXn
AJTs726BAZKTLPTrSyYjYvLg1r3XQHnqePiNrACpZhdbJBu9UjQTyjmnQA+j2vXv
DdcPWP/ImwrrBa+gAtHSHxhKVRPWdGBBLU/0W4jNe7/PEetkguO5JCvGreM4oDgP
n6AkGlnn6sjAtsofxaWs5jiP0lwfe8a/a5c4eIaZyZL9i3Nq1hJy+HKYM6rQTN/g
hRD+VoeweKZ/DyhO+wlFiiV1MqpzWvJbNFOEtaTZwl38dycqWal93OF9BGWo9L2A
Pwj+6+cWRRvmXTaPSYvqVP/R+p450GyIKo/9+DAguaLDAiL5qni0Yg/I9QFKJkCY
roZBvYv86Q+bVQjlJnxASETsVNskduBGu3ducoZA+n+XAgMBAAE=
-----END PUBLIC KEY-----`;

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    encoding: "utf8",
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID, ...(options.env ?? {}) },
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim() : "";
    throw new Error(`${commandName} ${args.join(" ")} failed with status ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return options.capture ? String(result.stdout ?? "") : "";
}

function npx(args, options = {}) {
  return command(process.platform === "win32" ? "npx.cmd" : "npx", args, options);
}

function node(args, options = {}) {
  return command(process.execPath, args, options);
}

function writeDiagnostic(value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  for (const directory of ["dist/client", "dist/client/pc-check"]) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, "provisioning-result.json"), text, "utf8");
  }
  console.log(`[provision] diagnostic written; ok=${Boolean(value.ok)}`);
}

function parseJsonOutput(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty JSON output");
  const firstBracket = Math.min(
    ...[trimmed.indexOf("["), trimmed.indexOf("{")].filter((value) => value >= 0),
  );
  if (!Number.isFinite(firstBracket)) throw new Error(`no JSON found in output: ${trimmed.slice(0, 300)}`);
  return JSON.parse(trimmed.slice(firstBracket));
}

function findDbId(rows) {
  if (!Array.isArray(rows)) return "";
  const row = rows.find((item) => item?.name === DB_NAME);
  return String(row?.uuid ?? row?.id ?? "");
}

function generateSecret(name) {
  return `choosepc_${name.toLowerCase()}_${randomBytes(32).toString("base64url")}`;
}

function encryptCredentials(credentials) {
  const payload = Buffer.from(JSON.stringify(credentials), "utf8");
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wrappedKey = publicEncrypt({
    key: PUBLIC_KEY,
    padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, key);
  return {
    scheme: "RSA-OAEP-SHA256+AES-256-GCM",
    wrappedKey: wrappedKey.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 1000) }; }
  return { response, body };
}

async function main() {
  const inWorkersBuild = process.env.WORKERS_CI === "1";
  const branch = process.env.WORKERS_CI_BRANCH ?? "";
  if (!inWorkersBuild || branch !== TARGET_BRANCH) {
    console.log(`[provision] skipped: workersCi=${inWorkersBuild} branch=${branch || "(none)"}`);
    return;
  }

  const diagnostic = {
    ok: false,
    branch,
    commit: process.env.WORKERS_CI_COMMIT_SHA ?? null,
    accountId: ACCOUNT_ID,
    databaseName: DB_NAME,
    databaseId: null,
    migrationsApplied: false,
    seedApplied: false,
    cpuCount: null,
    gpuCount: null,
    commercialProgramCount: null,
    conversionCount: null,
    runtimeSecretsConfigured: [],
    credentials: null,
    activeProductionVerified: false,
    error: null,
  };

  const redirectPath = resolve(".wrangler/deploy/config.json");
  const redirectBackup = existsSync(redirectPath) ? readFileSync(redirectPath, "utf8") : null;
  let secretFile = null;

  try {
    let rows = parseJsonOutput(npx(["wrangler", "d1", "list", "--json"], { capture: true }));
    let databaseId = findDbId(rows);
    if (!databaseId) {
      console.log(`[provision] creating D1 ${DB_NAME} in APAC`);
      npx(["wrangler", "d1", "create", DB_NAME, "--location", "apac"]);
      rows = parseJsonOutput(npx(["wrangler", "d1", "list", "--json"], { capture: true }));
      databaseId = findDbId(rows);
    }
    if (!databaseId) throw new Error("D1 database ID could not be resolved after create/list");
    diagnostic.databaseId = databaseId;

    const configPath = resolve("wrangler.jsonc");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.d1_databases = [{
      binding: "DB",
      database_name: DB_NAME,
      database_id: databaseId,
      migrations_dir: "migrations",
    }];
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    npx(["wrangler", "d1", "migrations", "apply", DB_NAME, "--remote", "--config", "wrangler.jsonc"]);
    diagnostic.migrationsApplied = true;

    const seedPath = "/tmp/choosepc-knowledge-seed.sql";
    node(["scripts/build_knowledge_seed.mjs", "--git-sha", process.env.WORKERS_CI_COMMIT_SHA ?? "workers-build", "--output", seedPath]);
    npx(["wrangler", "d1", "execute", DB_NAME, "--remote", `--file=${seedPath}`, "--yes", "--config", "wrangler.jsonc"]);
    diagnostic.seedApplied = true;

    const verifyText = npx([
      "wrangler", "d1", "execute", DB_NAME, "--remote", "--json", "--config", "wrangler.jsonc",
      "--command", "SELECT (SELECT COUNT(*) FROM hardware_cpu) AS cpu_count, (SELECT COUNT(*) FROM hardware_gpu) AS gpu_count, (SELECT COUNT(*) FROM commercial_programs) AS commercial_program_count, (SELECT COUNT(*) FROM conversion_events) AS conversion_count;",
    ], { capture: true });
    const verifyPayload = parseJsonOutput(verifyText);
    const verifyRows = Array.isArray(verifyPayload) ? verifyPayload.flatMap((item) => item?.results ?? []) : [];
    const counts = verifyRows[0] ?? {};
    diagnostic.cpuCount = Number(counts.cpu_count ?? 0);
    diagnostic.gpuCount = Number(counts.gpu_count ?? 0);
    diagnostic.commercialProgramCount = Number(counts.commercial_program_count ?? 0);
    diagnostic.conversionCount = Number(counts.conversion_count ?? 0);
    if (diagnostic.cpuCount !== 374 || diagnostic.gpuCount !== 243) {
      throw new Error(`seed verification failed: cpu=${diagnostic.cpuCount} gpu=${diagnostic.gpuCount}`);
    }
    if (diagnostic.commercialProgramCount !== 0) {
      throw new Error(`refusing to provision over unexpected commercial programs: ${diagnostic.commercialProgramCount}`);
    }

    const credentials = Object.fromEntries(REQUIRED_SECRETS.map((name) => [name, generateSecret(name)]));
    diagnostic.credentials = encryptCredentials(credentials);
    diagnostic.runtimeSecretsConfigured = [...REQUIRED_SECRETS];
    secretFile = `/tmp/choosepc-secrets-${randomBytes(8).toString("hex")}.json`;
    writeFileSync(secretFile, JSON.stringify(credentials), { mode: 0o600 });

    if (redirectBackup != null) rmSync(redirectPath, { force: true });
    console.log("[provision] deploying active Worker with D1 binding and fresh runtime secrets");
    npx([
      "wrangler", "deploy", "--strict", "--config", "wrangler.jsonc", "--keep-vars",
      "--secrets-file", secretFile,
    ]);

    for (let attempt = 1; attempt <= 24; attempt += 1) {
      const suffix = `${process.env.WORKERS_CI_COMMIT_SHA ?? "provision"}-${attempt}`;
      const health = await fetchJson(`${PRODUCTION_ORIGIN}/api/v1/health?provision=${suffix}`, {
        headers: { "cache-control": "no-cache", origin: FRONTEND_ORIGIN },
      });
      const overview = await fetchJson(`${PRODUCTION_ORIGIN}/api/internal/admin/overview?provision=${suffix}`, {
        headers: { authorization: `Bearer ${credentials.COMMERCIAL_ADMIN_TOKEN}`, "cache-control": "no-cache" },
      });
      const collector = await fetchJson(`${PRODUCTION_ORIGIN}/api/internal/collectors/status?provision=${suffix}`, {
        headers: { authorization: `Bearer ${credentials.OFFER_INGEST_TOKEN}`, "cache-control": "no-cache" },
      });
      const good = health.response.ok
        && health.body?.persistenceConfigured === true
        && overview.response.ok
        && collector.response.ok
        && Array.isArray(collector.body?.sources);
      console.log(`[provision] verify ${attempt}: health=${health.response.status} db=${health.body?.persistenceConfigured} overview=${overview.response.status} collector=${collector.response.status} matched=${good}`);
      if (good) {
        diagnostic.activeProductionVerified = true;
        diagnostic.ok = true;
        break;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5000));
    }
    if (!diagnostic.activeProductionVerified) throw new Error("active Worker did not verify with D1 and protected admin endpoints");
  } catch (error) {
    diagnostic.error = error instanceof Error ? error.message : String(error);
    console.error(`[provision] ${diagnostic.error}`);
  } finally {
    if (secretFile) rmSync(secretFile, { force: true });
    if (redirectBackup != null) {
      mkdirSync(resolve(".wrangler/deploy"), { recursive: true });
      writeFileSync(redirectPath, redirectBackup, "utf8");
    }
    writeDiagnostic(diagnostic);
  }
}

await main();
