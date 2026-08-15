import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const interactionCss = await readFile(new URL("../src/interaction.css", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const offers = await readFile(new URL("../src/OfferRecommendations.tsx", import.meta.url), "utf8");
const visual = await readFile(new URL("./capture_visual_states.mjs", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const vite = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const routingEntry = await readFile(new URL("../apps/worker/src/szpc-entry.ts", import.meta.url), "utf8");

const failures = [];
const allCss = `${styles}\n${interactionCss}`;
const cssWithoutComments = allCss.replace(/\/\*[\s\S]*?\*\//g, "");

const requiredApp = [
  ["このパソコン、買って大丈夫？", "concrete purchase question"],
  ["商品URLで確認", "URL diagnostic route"],
  ["スペックから", "manual diagnostic route"],
  ["購入前チェック", "purchase workflow"],
  ["買い替えチェック", "replacement workflow"],
  ["売却チェック", "sale workflow"],
  ["正二郎商事株式会社", "operator identity"],
];
for (const [needle, label] of requiredApp) {
  if (!app.includes(needle)) failures.push(`App.tsx is missing ${label}: ${needle}`);
}

const requiredDesign = [
  ["--szpc-shell:1360px", "bounded desktop shell"],
  ["--szpc-reading:1040px", "bounded task reading width"],
  ["background:#ffffff", "plain page background"],
  [".diagnosis-layout{display:block", "single-column diagnosis flow"],
  [".diagnosis-sidebar{display:none!important}", "dashboard sidebar suppression"],
  [".service-notice,.operator-stamp,.diagnosis-progress{display:none!important}", "secondary dashboard chrome suppression"],
  [".result-score,.score-table,.engine-note{display:none!important}", "score dashboard suppression"],
  [".reason-grid{display:block", "result explanation uses reading flow"],
  [".offer-rank{display:none!important}", "visible offer ranking suppression"],
  ["border-top:4px solid var(--szpc-navy)", "section hierarchy without cards"],
];
for (const [needle, label] of requiredDesign) {
  if (!styles.includes(needle)) failures.push(`styles.css is missing ${label}: ${needle}`);
}

const requiredStateGuards = [
  [".result-section:has(.result-banner.neutral) .reason-grid{display:none!important}", "insufficient-data explanation suppression"],
  [".site-main:has(.result-banner.neutral)>.offer-section{display:none!important}", "insufficient-data offer suppression"],
  [".site-main:has(.result-banner.neutral)>.next-actions{display:none!important}", "insufficient-data action suppression"],
];
for (const [needle, label] of requiredStateGuards) {
  if (!interactionCss.includes(needle)) failures.push(`interaction.css is missing ${label}: ${needle}`);
}

const forbiddenEffects = ["linear-gradient", "radial-gradient", "conic-gradient", "backdrop-filter", "box-shadow"];
for (const needle of forbiddenEffects) {
  if (cssWithoutComments.includes(needle)) failures.push(`CSS reintroduced decorative template effect: ${needle}`);
}

if (/border-radius\s*:\s*(?!0(?:px)?(?:[;\s}]|$))/i.test(cssWithoutComments)) {
  failures.push("CSS reintroduced non-zero rounded corners.");
}
const fontAuditCss = cssWithoutComments.replace(/\.merchant-type\{[^}]*\}/g, "");
if (/font-size\s*:\s*(?:[0-9]|1[01])px/.test(fontAuditCss)) {
  failures.push("Primary UI CSS contains text below 12px.");
}
if (!/\.merchant-type\{[^}]*font-size:11px/.test(cssWithoutComments)) {
  failures.push("The only approved 11px exception must remain the compact merchant disclosure label.");
}

const forbiddenMainImports = ["diagnostic-polish.css", "reference-layout.css", "catalog-suggest.css"];
for (const needle of forbiddenMainImports) {
  if (main.includes(needle)) failures.push(`main.tsx still imports retired or layered CSS: ${needle}`);
}
for (const needle of ['import "./styles.css"', 'import "./interaction.css"']) {
  if (!main.includes(needle)) failures.push(`main.tsx is missing canonical CSS import: ${needle}`);
}

if (!vite.includes('base: "/pc-check/"')) failures.push("Vite base path is not /pc-check/.");

const requiredWrangler = [
  ['"main": "./apps/worker/src/szpc-entry.ts"', "szpc routing entrypoint"],
  ['"binding": "ASSETS"', "static asset binding"],
  ['"run_worker_first": true', "prefix-aware asset routing"],
  ['"pattern": "www.szpc.jp/pc-check"', "exact /pc-check route"],
  ['"pattern": "www.szpc.jp/pc-check/*"', "nested /pc-check route"],
  ['"pattern": "www.szpc.jp/api/v1/*"', "same-origin API route"],
];
for (const [needle, label] of requiredWrangler) {
  if (!wrangler.includes(needle)) failures.push(`wrangler.jsonc is missing ${label}: ${needle}`);
}

const requiredRouting = [
  ['const SERVICE_PREFIX = "/pc-check"', "service prefix"],
  ["Response.redirect(url.toString(), 308)", "canonical trailing-slash redirect"],
  ["stripServicePrefix", "prefix stripping"],
  ["isLocalVite", "local Vite base-path preservation"],
  ["env.ASSETS.fetch", "asset binding dispatch"],
  ['url.pathname.startsWith("/api/")', "legacy/root API dispatch"],
];
for (const [needle, label] of requiredRouting) {
  if (!routingEntry.includes(needle)) failures.push(`szpc-entry.ts is missing ${label}: ${needle}`);
}

if (!index.includes('href="https://www.szpc.jp/pc-check/"')) failures.push("index.html is missing the canonical szpc URL.");
if (!index.includes("PC購入・買い替え診断 | 正二郎商事株式会社")) failures.push("index.html is missing the integrated service title.");
if (!index.includes('content="#12344a"')) failures.push("index.html theme-color does not match the szpc header.");

const forbiddenOffers = [
  ["<div className=\"offer-rank\"", "visible ranking-number block"],
  ["総合 {Math.round", "synthetic overall score in shopping comparison"],
  ["用途 {Math.round", "raw fit score in shopping comparison"],
  ["価格 {Math.round", "raw value score in shopping comparison"],
  ["判定情報 {Math.round", "raw confidence percentage in shopping comparison"],
];
for (const [needle, label] of forbiddenOffers) {
  if (offers.includes(needle)) failures.push(`OfferRecommendations.tsx reintroduced ${label}: ${needle}`);
}
for (const needle of ["用途：", "価格：", "情報："]) {
  if (!offers.includes(needle)) failures.push(`OfferRecommendations.tsx is missing human-readable comparison signal: ${needle}`);
}

for (const needle of ["scoreVisible", "offerVisible", "reasonVisible", "nextVisible", "horizontal overflow"]) {
  if (!visual.includes(needle)) failures.push(`capture_visual_states.mjs is missing visual regression assertion: ${needle}`);
}

if (failures.length) {
  console.error("UI / URL integration regression check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("UI / URL integration regression check passed.");
