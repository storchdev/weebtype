// Download and build the dictionary data in data/ from public sources:
//   - Jitendex (Yomitan zip)  → dictionary.json + examples.json   (CC BY-SA 4.0; Tatoeba CC BY 2.0 FR)
//   - Kanjium accents.txt     → pitch.json                         (CC BY-SA 4.0)
//
//   bun run data:setup                     download + build (skips if data/ is already complete)
//   bun run data:setup --force             rebuild even if data/ exists
//   bun run data:setup --jitendex x.zip    use an already-downloaded Jitendex zip
//   bun run data:setup --pitch accents.txt use an already-downloaded Kanjium accents.txt
//   --soft                                 on failure, warn and exit 0 (used by `bun start` / `bun dev`
//                                          so the app still runs, without hints, when offline)
//
// Needs `unzip` on PATH. Downloads go to a temp dir and are removed afterwards.

import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DATA_DIR } from "../server/dictionary.ts";
import { buildDictionary, buildExamples, buildPitch, type TermBankEntry } from "./build-data.ts";

const JITENDEX_URL =
  "https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip";
const PITCH_URL =
  "https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const force = args.includes("--force");
const soft = args.includes("--soft");
const OUT = ["dictionary.json", "pitch.json", "examples.json"];

if (!force) {
  const have = await Promise.all(OUT.map((n) => Bun.file(join(DATA_DIR, n)).exists()));
  if (have.every(Boolean)) {
    console.log("data/ already has dictionary.json, pitch.json and examples.json (use --force to rebuild).");
    process.exit(0);
  }
}

async function download(url: string, to: string): Promise<void> {
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await Bun.write(to, res);
  console.log(`  ${(Bun.file(to).size / 1e6).toFixed(1)} MB`);
}

const tmp = await mkdtemp(join(tmpdir(), "weebtype-data-"));
try {
  await mkdir(DATA_DIR, { recursive: true });

  // Pitch first: small and fast, so network problems show up early.
  const pitchSrc = flag("--pitch") ?? join(tmp, "accents.txt");
  if (!flag("--pitch")) await download(PITCH_URL, pitchSrc);
  const pitch = buildPitch(await Bun.file(pitchSrc).text());
  await Bun.write(join(DATA_DIR, "pitch.json"), JSON.stringify(pitch));
  console.log(`wrote pitch.json (${Object.keys(pitch).length} terms)`);

  const zip = flag("--jitendex") ?? join(tmp, "jitendex.zip");
  if (!flag("--jitendex")) await download(JITENDEX_URL, zip);
  const dir = join(tmp, "jitendex");
  const unzip = Bun.spawnSync(["unzip", "-qo", zip, "term_bank_*.json", "-d", dir], { stderr: "inherit" });
  if (unzip.exitCode !== 0) throw new Error("unzip failed (is `unzip` installed?)");

  const files = (await readdir(dir)).filter((f) => /^term_bank_\d+\.json$/.test(f));
  files.sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  const entries: TermBankEntry[] = [];
  for (const f of files) {
    const bank = (await Bun.file(join(dir, f)).json()) as TermBankEntry[];
    for (const e of bank) entries.push(e);
  }
  console.log(`read ${entries.length} Jitendex entries from ${files.length} term banks`);

  const dict = buildDictionary(entries);
  await Bun.write(join(DATA_DIR, "dictionary.json"), JSON.stringify(dict));
  console.log(`wrote dictionary.json (${Object.keys(dict).length} terms)`);

  const examples = buildExamples(entries);
  await Bun.write(join(DATA_DIR, "examples.json"), JSON.stringify(examples));
  console.log(`wrote examples.json (${Object.keys(examples).length} terms)`);
} catch (e) {
  console.error(`[data] setup failed: ${e instanceof Error ? e.message : String(e)}`);
  if (!soft) process.exitCode = 1;
  else console.error("[data] continuing without the dictionary (no hints); retry with `bun run data:setup`.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
