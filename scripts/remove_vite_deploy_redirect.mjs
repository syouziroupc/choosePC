import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const generatedRedirect = resolve(".wrangler/deploy/config.json");

if (existsSync(generatedRedirect)) {
  rmSync(generatedRedirect, { force: true });
  console.log(`[deploy-config] removed Vite-generated Wrangler redirect: ${generatedRedirect}`);
} else {
  console.log("[deploy-config] no Vite-generated Wrangler redirect found");
}
