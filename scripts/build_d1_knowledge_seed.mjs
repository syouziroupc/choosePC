import { readFile, unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
function argument(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const output = argument("--output");
if (!output) throw new Error("--output is required");
const gitSha = argument("--git-sha", process.env.GITHUB_SHA || "local");
const version = argument("--version");
const temp = `/tmp/choosepc-seed-${randomUUID()}.sql`;

try {
  const childArgs = ["scripts/build_knowledge_seed.mjs", "--git-sha", gitSha, "--output", temp];
  if (version) childArgs.push("--version", version);
  const result = spawnSync(process.execPath, childArgs, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`knowledge seed generator failed with status ${result.status}`);

  const source = await readFile(temp, "utf8");
  const lines = source
    .split(/\r?\n/)
    .filter((line) => !/^\s*(BEGIN TRANSACTION|COMMIT;)\s*$/i.test(line));
  const sanitized = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  if (/\bBEGIN\s+TRANSACTION\b|^\s*COMMIT;\s*$/im.test(sanitized)) {
    throw new Error("D1 seed still contains an explicit transaction statement");
  }
  await writeFile(output, sanitized, "utf8");
  console.log(`Wrote D1-compatible seed ${output}; explicit BEGIN/COMMIT removed.`);
} finally {
  await unlink(temp).catch(() => {});
}
