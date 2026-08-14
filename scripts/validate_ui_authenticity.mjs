import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

const failures = [];
const forbiddenApp = [
  ["eyebrow", "decorative eyebrow labels"],
  ["HOW IT WORKS", "generic landing-page process heading"],
  ["hero-proof", "four-part proof strip"],
  ["journey-steps", "generic three-step landing-page sequence"],
  ["action-bridge", "full-width conversion band"],
  ["company-band", "promotional operator band"],
  ["header-cta", "duplicate header CTA"],
];
for (const [needle, label] of forbiddenApp) {
  if (app.includes(needle)) failures.push(`App.tsx reintroduced ${label}: ${needle}`);
}

const forbiddenCss = [
  ["linear-gradient", "decorative gradient"],
  ["radial-gradient", "decorative gradient"],
  ["backdrop-filter", "glass-effect header"],
  ["box-shadow", "page/card shadow treatment"],
];
for (const [needle, label] of forbiddenCss) {
  if (css.includes(needle)) failures.push(`styles.css reintroduced ${label}: ${needle}`);
}

if (/border-radius\s*:\s*(?!0(?:px|rem|em|%|;|\}))/i.test(css)) {
  failures.push("styles.css contains non-zero border radius; review whether a rounded container is actually required.");
}
if (!app.includes("PCの購入・買い替え・売却を判定")) {
  failures.push("Direct task-oriented H1 is missing.");
}
if (!app.includes("商品URL") || !app.includes("スペックから")) {
  failures.push("Primary diagnostic inputs are not clearly named.");
}
if (!index.includes("PC購入・買い替え・売却の判定")) {
  failures.push("The static page title no longer matches the direct task-oriented interface.");
}

if (failures.length) {
  console.error("UI authenticity regression check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("UI authenticity regression check passed.");
