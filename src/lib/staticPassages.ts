// Static web build: Tatoeba passages drawn in the browser from pre-annotated chunk files
// (written by scripts/build-static.ts into sentences/). Each length bucket keeps one
// loaded chunk as a pool; sentences are drawn without repeats and a fresh chunk is
// fetched when a pool runs low.

import {
  type Chunk,
  chunkFile,
  decodeChunk,
  drawPassage,
  levelBuckets,
  type Manifest,
  type Sentence,
} from "./core/sentences.ts";
import type { Level, Passage } from "./core/types.ts";

const BASE = `${import.meta.env.BASE_URL}sentences/`;
/** Refill a bucket's pool below this many sentences (a long passage needs ~50). */
const LOW = 80;

let manifest: Promise<Manifest> | null = null;
const pools = new Map<number, Sentence[]>();
const lastChunk = new Map<number, number>();

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return (await res.json()) as T;
}

async function refill(bucket: number, chunks: number): Promise<void> {
  if ((pools.get(bucket)?.length ?? 0) >= LOW || chunks === 0) return;
  // a random chunk, not the one just used up (unless it's the only one)
  let c = Math.floor(Math.random() * chunks);
  if (chunks > 1 && c === lastChunk.get(bucket)) c = (c + 1) % chunks;
  lastChunk.set(bucket, c);
  const fresh = decodeChunk(await getJson<Chunk>(chunkFile(bucket, c)));
  pools.set(bucket, [...(pools.get(bucket) ?? []), ...fresh]);
}

export async function staticPassage(level: Level, length: number): Promise<Passage> {
  manifest ??= getJson<Manifest>("manifest.json").catch((e: unknown) => {
    manifest = null;
    throw e;
  });
  const m = await manifest;
  const buckets = levelBuckets(level).filter((b) => (m.buckets[b]?.count ?? 0) > 0);
  await Promise.all(buckets.map((b) => refill(b, m.buckets[b]?.chunks ?? 0)));
  // Pick a bucket in proportion to its size (= uniform over the level's sentences).
  const next = (): Sentence | undefined => {
    const live = buckets.filter((b) => (pools.get(b)?.length ?? 0) > 0);
    const total = live.reduce((n, b) => n + (m.buckets[b]?.count ?? 0), 0);
    let r = Math.random() * total;
    for (const b of live) {
      r -= m.buckets[b]?.count ?? 0;
      if (r < 0 || b === live[live.length - 1]) {
        const pool = pools.get(b) as Sentence[];
        const i = Math.floor(Math.random() * pool.length);
        const [s] = pool.splice(i, 1);
        return s;
      }
    }
    return undefined;
  };
  return drawPassage(level, length, next);
}
