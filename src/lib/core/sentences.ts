// Tatoeba sentence passages, shared by the server (Tatoeba fallback) and the static web
// build, which ships the sentences pre-annotated in small chunk files instead of a server.

import type { DictEntry, Level, Passage, RubyGroup, Token } from "./types.ts";

export interface Sentence {
  tokens: Token[];
  /** Kana to type (sentence length). */
  kana: number;
  translation: string;
}

/** Longest sentence (in kana) a level draws from: a rough difficulty proxy. */
export const LEVEL_MAX_KANA: Record<Level, number> = { N5: 20, N4: 28, N3: 40, N2: 60, N1: 80, native: 80 };

/** Static build: sentences are grouped by length into these buckets (upper bounds, kana). */
export const BUCKETS = [20, 28, 40, 60, 80] as const;

/** Index of the length bucket a sentence of `kana` kana belongs to. */
export function bucketOf(kana: number): number {
  const i = BUCKETS.findIndex((max) => kana <= max);
  return i < 0 ? BUCKETS.length - 1 : i;
}

/** Static build index: per bucket, how many sentences and in how many chunk files. */
export interface Manifest {
  buckets: Array<{ max: number; count: number; chunks: number }>;
}

/** A token on the wire: its ruby groups, plus indexes into the chunk's entry table. */
export type WireToken = [RubyGroup[]] | [RubyGroup[], number[]];

/** One chunk file: a shared dictionary-entry table and [kana, translation, tokens] rows. */
export interface Chunk {
  e: DictEntry[];
  s: Array<[number, string, WireToken[]]>;
}

export function chunkFile(bucket: number, chunk: number): string {
  return `b${bucket}-${chunk}.json`;
}

/** Pack annotated sentences, storing each distinct dictionary entry once. */
export function encodeChunk(sentences: readonly Sentence[]): Chunk {
  const ids = new Map<string, number>();
  const e: DictEntry[] = [];
  const s = sentences.map((sen): [number, string, WireToken[]] => [
    sen.kana,
    sen.translation,
    sen.tokens.map((tok): WireToken => {
      if (!tok.dict) return [tok.groups];
      const refs = tok.dict.map((entry) => {
        const k = JSON.stringify(entry);
        let id = ids.get(k);
        if (id === undefined) {
          id = e.length;
          ids.set(k, id);
          e.push(entry);
        }
        return id;
      });
      return [tok.groups, refs];
    }),
  ]);
  return { e, s };
}

export function decodeChunk(c: Chunk): Sentence[] {
  return c.s.map(([kana, translation, toks]) => ({
    kana,
    translation,
    tokens: toks.map(([groups, refs]): Token => {
      if (!refs) return { groups };
      return { groups, dict: refs.map((i) => c.e[i]).filter((d): d is DictEntry => d !== undefined) };
    }),
  }));
}

/** Buckets a level may draw from (all sentences up to its maximum length). */
export function levelBuckets(level: Level): number[] {
  return BUCKETS.flatMap((max, i) => (max <= LEVEL_MAX_KANA[level] ? [i] : []));
}

/**
 * Join random sentences until the passage reaches ~`length` kana. `next` returns the next
 * random sentence, or undefined when none are left.
 */
export function drawPassage(level: Level, length: number, next: () => Sentence | undefined): Passage {
  const tokens: Token[] = [];
  const translations: string[] = [];
  let kana = 0;
  while (kana < length * 0.9) {
    const s = next();
    if (!s) break;
    tokens.push(...s.tokens);
    translations.push(s.translation);
    kana += s.kana;
  }
  return {
    id: crypto.randomUUID(),
    source: "tatoeba",
    level,
    translation: translations.join(" "),
    tokens,
  };
}
