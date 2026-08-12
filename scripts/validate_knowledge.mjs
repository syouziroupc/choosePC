import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p));
    else if (p.endsWith(".json")) out.push(p);
  }
  return out;
}

const files = await walk(new URL("../knowledge", import.meta.url).pathname);
const ids = new Map();
let failed = false;
for (const file of files) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    if (value.id) {
      if (ids.has(value.id)) {
        console.error(`duplicate id ${value.id}: ${ids.get(value.id)} and ${file}`);
        failed = true;
      }
      ids.set(value.id, file);
    }
  } catch (e) {
    console.error(`invalid JSON: ${file}: ${e.message}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`knowledge validation ok: ${files.length} JSON files`);
