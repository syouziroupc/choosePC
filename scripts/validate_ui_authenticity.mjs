import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const baseCss = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const polishCss = await readFile(new URL("../src/diagnostic-polish.css", import.meta.url), "utf8");
const referenceCss = await readFile(new URL("../src/reference-layout.css", import.meta.url), "utf8");
const offers = await readFile(new URL("../src/OfferRecommendations.tsx", import.meta.url), "utf8");
const visual = await readFile(new URL("./capture_visual_states.mjs", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

const failures = [];
const combinedCss = `${baseCss}\n${polishCss}\n${referenceCss}`;
const designedCss = `${polishCss}\n${referenceCss}`;

const requiredApp = [
  ["このパソコン、買って大丈夫？", "concrete purchase question"],
  ["商品URLで確認", "URL diagnostic route"],
  ["スペックから", "manual diagnostic route"],
  ["購入前チェック", "purchase workflow"],
  ["買い替えチェック", "replacement workflow"],
  ["売却チェック", "sale workflow"],
  ["正二郎商事株式会社", "operator identity"],
];
for (const [needle, label] of requiredApp) if (!app.includes(needle)) failures.push(`App.tsx is missing ${label}: ${needle}`);

const requiredPolish = [
  ["--ui-shell:1360px", "reference-driven 1920px shell"],
  ["--ui-reading:900px", "bounded reading/form measure"],
  ["body{background:var(--ui-page);color:var(--ui-ink);font-size:16px", "readable default typography"],
  ["font-size:clamp(38px,2.35vw,44px)", "desktop H1 scale"],
  [".service-notice,.operator-stamp,.diagnosis-progress{display:none!important}", "initial-screen clutter suppression"],
  [".diagnosis-sidebar{display:none!important}", "persistent dashboard sidebar removal"],
  [".field-row{display:block", "vertical task-form field structure"],
  [".field-label{display:block", "labels above controls"],
  [".result-score,.score-table,.engine-note{display:none!important}", "non-primary numeric dashboard suppression"],
  [".result-banner.neutral~.reason-grid{display:none!important}", "no synthetic positives on held results"],
  [".site-main:has(.result-banner.neutral)>.offer-section", "no product recommendations on held results"],
  [".site-main:has(.result-banner.neutral)>.next-actions{display:none!important}", "no purchase actions on held results"],
  [".workflow-switch{order:3", "secondary workflows placed after primary diagnosis input"],
  [".offer-row{display:grid", "row-based product comparison"],
];
for (const [needle, label] of requiredPolish) if (!polishCss.includes(needle)) failures.push(`diagnostic-polish.css is missing ${label}: ${needle}`);

const requiredReference = [
  ["grid-template-columns:minmax(0, 900px) minmax(320px, 1fr)", "asymmetric wide-screen initial composition"],
  ["grid-column:2", "secondary criteria column on wide screens"],
  [".site-main:not(:has(#result))>.principle", "initial-state criteria placement"],
];
for (const [needle, label] of requiredReference) if (!referenceCss.includes(needle)) failures.push(`reference-layout.css is missing ${label}: ${needle}`);

for (const needle of ["linear-gradient", "radial-gradient", "backdrop-filter"]) {
  if (combinedCss.includes(needle)) failures.push(`CSS reintroduced decorative template effect: ${needle}`);
}
if (/box-shadow\s*:\s*(?!none)/.test(designedCss)) failures.push("Reference-driven CSS reintroduced ordinary content box shadows.");
const cssWithoutComments = designedCss.replace(/\/\*[\s\S]*?\*\//g, "");
if (/font-size\s*:\s*(?:[0-9]|1[01])px/.test(cssWithoutComments)) failures.push("Reference-driven CSS contains task/interface text below 12px; 12px is reserved only for low-priority footer/brand metadata.");

const forbiddenOffers = [
  ["<div className=\"offer-rank\"", "visible ranking-number block"],
  ["総合 {Math.round", "synthetic overall score in shopping comparison"],
  ["用途 {Math.round", "raw fit score in shopping comparison"],
  ["価格 {Math.round", "raw value score in shopping comparison"],
  ["判定情報 {Math.round", "raw confidence percentage in shopping comparison"],
];
for (const [needle, label] of forbiddenOffers) if (offers.includes(needle)) failures.push(`OfferRecommendations.tsx reintroduced ${label}: ${needle}`);
for (const needle of ["用途：", "価格：", "情報："]) if (!offers.includes(needle)) failures.push(`OfferRecommendations.tsx is missing human-readable comparison signal: ${needle}`);

for (const needle of ["scoreVisible", "offerVisible", "reasonVisible", "nextVisible", "horizontal overflow"]) if (!visual.includes(needle)) failures.push(`capture_visual_states.mjs is missing visual regression assertion: ${needle}`);

if (!index.includes("PC ASSIST | このパソコン、買って大丈夫？")) failures.push("index.html is missing the concrete diagnostic page title.");
if (!index.includes('content="#0b3b5b"')) failures.push("index.html theme-color does not match the service header.");

if (failures.length) {
  console.error("UI authenticity regression check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("UI authenticity regression check passed.");
