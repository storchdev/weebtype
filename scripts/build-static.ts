// Static web build (no API server): the frontend in `--mode static` plus every Tatoeba
// sentence pre-annotated with its dictionary entries, in chunk files the browser draws
// passages from (src/lib/staticPassages.ts). Output: dist-static/ and weebtype-web.zip
// (upload as an itch.io HTML game, or serve dist-static/ from any static host).
//
//   bun run build:static        (runs data:setup first if data/ is incomplete)

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Dictionary } from "../server/dictionary.ts";
import { PassageService } from "../server/passages.ts";
import { Tatoeba } from "../server/tatoeba.ts";
import {
  BUCKETS,
  bucketOf,
  chunkFile,
  encodeChunk,
  type Manifest,
  type Sentence,
} from "../src/lib/core/sentences.ts";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "dist-static");
const ZIP = join(ROOT, "weebtype-web.zip");
/** Sentences per chunk file (~80 KB gzipped): what one level's first load fetches per bucket. */
const CHUNK = 400;

/** Deterministic shuffle so rebuilding the same data gives the same files. */
function shuffle<T>(xs: T[], seed = 0x5eed): T[] {
  let a = seed;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j] as T, xs[i] as T];
  }
  return xs;
}

async function run(cmd: string[], cwd = ROOT): Promise<void> {
  const code = await Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit" }).exited;
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited with ${code}`);
}

await run(["bunx", "--bun", "vite", "build", "--mode", "static"]);

const dict = await Dictionary.load();
if (!dict) throw new Error("data/dictionary.json missing — run `bun run data:setup`");
const service = new PassageService();
service.dict = dict;
const tatoeba = new Tatoeba(dict.rawExamples);

const buckets: Sentence[][] = BUCKETS.map(() => []);
for (const s of tatoeba.sentences) {
  buckets[bucketOf(s.kana)]?.push({ ...s, tokens: service.annotate(s.tokens) });
}

const dir = join(OUT, "sentences");
await mkdir(dir, { recursive: true });
const manifest: Manifest = { buckets: [] };
let bytes = 0;
for (const [b, list] of buckets.entries()) {
  shuffle(list);
  const chunks = Math.ceil(list.length / CHUNK);
  for (let c = 0; c < chunks; c++) {
    const json = JSON.stringify(encodeChunk(list.slice(c * CHUNK, (c + 1) * CHUNK)));
    bytes += json.length;
    await Bun.write(join(dir, chunkFile(b, c)), json);
  }
  manifest.buckets.push({ max: BUCKETS[b] as number, count: list.length, chunks });
}
await Bun.write(join(dir, "manifest.json"), JSON.stringify(manifest));
const files = manifest.buckets.reduce((n, b) => n + b.chunks, 0);
console.log(`[static] ${tatoeba.size} sentences → ${files} chunks, ${(bytes / 1e6).toFixed(1)} MB in ${dir}`);

await rm(ZIP, { force: true });
await run(["zip", "-qr", ZIP, "."], OUT);
console.log(`[static] ${ZIP} (${((await Bun.file(ZIP).size) / 1e6).toFixed(1)} MB)`);
