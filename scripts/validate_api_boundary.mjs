import { readFile } from "node:fs/promises";

const wranglerText = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const apiEntry = await readFile(new URL("../apps/worker/src/api-entry.ts", import.meta.url), "utf8");
const opsConsole = await readFile(new URL("../apps/worker/src/ops-console.ts", import.meta.url), "utf8");
const adminStore = await readFile(new URL("../apps/worker/src/admin-store.ts", import.meta.url), "utf8");
const docs = await readFile(new URL("../docs/STATIC_FRONTEND_API.md", import.meta.url), "utf8");

const failures = [];
let wrangler;
try {
  wrangler = JSON.parse(wranglerText);
} catch (error) {
  failures.push(`wrangler.jsonc is not parseable JSON: ${error instanceof Error ? error.message : String(error)}`);
}

if (wrangler) {
  if (wrangler.main !== "./apps/worker/src/api-entry.ts") failures.push(`Worker entry must remain api-entry.ts: ${String(wrangler.main)}`);
  if (wrangler.workers_dev !== true) failures.push("workers_dev must remain enabled for the operations console and API transport.");
  if (Array.isArray(wrangler.routes) && wrangler.routes.length > 0) failures.push("choosePC must not own www.szpc.jp routes while SZPC is a separately deployed static frontend.");
  if (wrangler.assets != null) failures.push("choosePC must not deploy the public SZPC static UI as Worker assets.");
  if (!wrangler.browser || wrangler.browser.binding !== "BROWSER") failures.push("Browser Run binding is required for URL-inspection fallback.");
  if (!Array.isArray(wrangler.ratelimits) || !wrangler.ratelimits.some((item) => item?.name === "URL_INSPECT_LIMITER")) failures.push("URL inspection rate-limit binding is missing.");
}

const requiredApiEntry = [
  ['const PUBLIC_API_PREFIX = "/api/v1/"', "public API namespace"],
  ['"https://www.szpc.jp"', "www.szpc.jp allowed origin"],
  ['"https://szpc.jp"', "apex szpc.jp allowed origin"],
  ['const CLIENT_HEADER = "x-choosepc-client"', "stable anonymous client header"],
  ['headers.set("access-control-allow-origin", origin)', "exact-origin CORS response"],
  ['"access-control-allow-headers": "Content-Type, X-ChoosePC-Client"', "CORS preflight header contract"],
  ['headers.delete("set-cookie")', "cross-origin cookie suppression"],
  ['url.pathname.startsWith("/api/internal/")', "internal API separation"],
  ['persistenceConfigured: Boolean(env.DB)', "persistence readiness reporting"],
  ['publicUiHostedHere: false', "public UI separation marker"],
  ['operationsConsole:', "operations console discovery marker"],
  ['url.pathname === "/api/internal/admin/overview"', "protected admin overview route"],
  ['recordApiRequest({', "public API usage metrics"],
  ['return scheduled(controller, env, ctx)', "collector schedule delegation"],
];
for (const [needle, label] of requiredApiEntry) {
  if (!apiEntry.includes(needle)) failures.push(`api-entry.ts is missing ${label}: ${needle}`);
}

const forbiddenApiEntry = [
  ["env.ASSETS", "public static asset dispatch"],
  ['const SERVICE_PREFIX = "/pc-check"', "legacy /pc-check UI prefix"],
  ["Access-Control-Allow-Origin: *", "wildcard CORS"],
];
for (const [needle, label] of forbiddenApiEntry) {
  if (apiEntry.includes(needle)) failures.push(`api-entry.ts reintroduced ${label}: ${needle}`);
}

const requiredOps = [
  ["choosePC Operations", "operations identity"],
  ["API利用状況", "request metrics section"],
  ["アフィリエイト・送客設定", "commercial configuration section"],
  ["API動作検証", "API tester"],
  ["sessionStorage", "session-scoped admin credential storage"],
  ["Authorization: 'Bearer ' + token()", "bearer-protected admin requests"],
  ["content-security-policy", "console CSP"],
];
for (const [needle, label] of requiredOps) {
  if (!opsConsole.includes(needle)) failures.push(`ops-console.ts is missing ${label}: ${needle}`);
}
if (opsConsole.includes("localStorage.setItem(tokenKey")) failures.push("Admin token must not be persisted in localStorage.");

for (const needle of ["api_request_metrics", "normalizeApiMetricPath", "commercial_programs", "attribution_links"]) {
  if (!adminStore.includes(needle)) failures.push(`admin-store.ts is missing operations data contract: ${needle}`);
}

const requiredDocs = [
  ["CHOOSEPC_API_BASE", "single frontend API-base constant"],
  ["crypto.randomUUID()", "browser client-id generation"],
  ["X-ChoosePC-Client", "frontend client header"],
  ['credentials: "include"', "explicit third-party-cookie prohibition note"],
  ["commercialOffers[].outboundPath", "outbound-link integration rule"],
  ["api.szpc.jp", "future API-host migration boundary"],
  ["Operations Console", "workers.dev operations role"],
];
for (const [needle, label] of requiredDocs) {
  if (!docs.includes(needle)) failures.push(`STATIC_FRONTEND_API.md is missing ${label}: ${needle}`);
}

if (failures.length) {
  console.error("Static frontend / API / operations boundary validation failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Static frontend / API / operations boundary validation passed.");
