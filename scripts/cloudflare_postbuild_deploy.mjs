import { spawnSync } from "node:child_process";

if (process.env.WORKERS_CI !== "1") {
  console.log("Cloudflare postbuild deploy skipped outside Workers Builds.");
  process.exit(0);
}

console.log("Workers Builds detected; promoting this build with wrangler deploy.");
const result = spawnSync("npx", ["wrangler", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
