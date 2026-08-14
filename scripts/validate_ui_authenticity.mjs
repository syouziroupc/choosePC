import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

const failures = [];

const requiredApp = [
  ["このパソコン、買って大丈夫？", "concrete purchase question"],
  ["商品URLで確認", "URL diagnostic route"],
  ["スペックから", "manual diagnostic route"],
  ["入力内容", "persistent selected-input summary"],
  ["正二郎商事株式会社", "operator identity"],
  ["判定で見ている項目", "plain-language scoring explanation"],
  ["field-row", "data-dense diagnostic field rows"],
  ["diagnosis-layout", "desktop diagnostic workspace"],
];
for (const [needle, label] of requiredApp) {
  if (!app.includes(needle)) failures.push(`App.tsx is missing ${label}: ${needle}`);
}

const forbiddenApp = [
  ["PCの購入・買い替え・売却を判定", "abstract generic H1"],
  ["HOW IT WORKS", "generic landing-page process heading"],
  ["hero-proof", "generic proof strip"],
  ["journey-steps", "generic landing-page sequence"],
  ["eyebrow", "decorative eyebrow copy"],
  ["action-bridge", "generic conversion band"],
  ["company-band", "promotional operator band"],
];
for (const [needle, label] of forbiddenApp) {
  if (app.includes(needle)) failures.push(`App.tsx reintroduced ${label}: ${needle}`);
}

const requiredCss = [
  ["1760px", "wide 1920px layout width"],
  ["--header:#0b3b5b", "colored service header"],
  ["grid-template-columns:minmax(0,1fr) 380px", "desktop main + summary sidebar layout"],
  ["position:sticky;top:112px", "persistent desktop input summary"],
];
for (const [needle, label] of requiredCss) {
  if (!css.includes(needle)) failures.push(`styles.css is missing ${label}: ${needle}`);
}

for (const needle of ["linear-gradient", "radial-gradient", "backdrop-filter"]) {
  if (css.includes(needle)) failures.push(`styles.css reintroduced decorative template effect: ${needle}`);
}

if (!index.includes("PC ASSIST | このパソコン、買って大丈夫？")) {
  failures.push("index.html is missing the concrete diagnostic page title.");
}
if (index.includes("beta-notice")) {
  failures.push("index.html still renders the obsolete duplicate beta notice.");
}
if (!index.includes('content="#0b3b5b"')) {
  failures.push("index.html theme-color does not match the colored service header.");
}

if (failures.length) {
  console.error("UI diagnostic-layout regression check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("UI diagnostic-layout regression check passed.");
