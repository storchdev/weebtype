// Copy Jitendex data (dictionary.json, pitch.json, examples.json) from a
// 10ff-yomitan-style directory into data/.
//   bun run data:import /path/to/10ff-yomitan

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../server/dictionary.ts";

const src = process.argv[2] ?? "/home/hudson/Desktop/japanslop/10ff-yomitan";
await mkdir(DATA_DIR, { recursive: true });
for (const name of ["dictionary.json", "pitch.json", "examples.json"]) {
  const from = Bun.file(join(src, name));
  if (!(await from.exists())) {
    console.error(`missing ${join(src, name)}${name === "dictionary.json" ? " (required)" : " (optional)"}`);
    if (name === "dictionary.json") process.exit(1);
    continue;
  }
  await Bun.write(join(DATA_DIR, name), from);
  console.log(`copied ${name} (${(from.size / 1e6).toFixed(1)} MB)`);
}
