import { describe, expect, test } from "bun:test";
import {
  BUCKETS,
  bucketOf,
  decodeChunk,
  drawPassage,
  encodeChunk,
  LEVEL_MAX_KANA,
  levelBuckets,
  type Sentence,
} from "../src/lib/core/sentences.ts";
import type { DictEntry } from "../src/lib/core/types.ts";

const entry = (term: string, reading: string): DictEntry => ({
  term,
  reading,
  pitch: 0,
  tags: ["n"],
  defs: [term],
  example: null,
  deinflectedFrom: null,
});

const neko = entry("猫", "ねこ");
const sentence = (kana: number, translation: string, withDict = true): Sentence => ({
  kana,
  translation,
  tokens: [
    { groups: [{ t: "猫", r: "ねこ" }], ...(withDict ? { dict: [neko] } : {}) },
    { groups: [{ t: "だ", r: "だ" }] },
    { groups: [{ t: "。", r: "。" }] },
  ],
});

describe("chunk encoding", () => {
  test("round-trips sentences, with and without dictionary entries", () => {
    const list = [sentence(4, "A cat."), sentence(4, "Cat.", false), sentence(4, "Again a cat.")];
    expect(decodeChunk(encodeChunk(list))).toEqual(list);
  });

  test("stores each distinct entry once", () => {
    const c = encodeChunk([sentence(4, "a"), sentence(4, "b"), sentence(4, "c")]);
    expect(c.e).toEqual([neko]);
    expect(c.s.map((row) => row[2][0]?.[1])).toEqual([[0], [0], [0]]);
  });
});

describe("buckets", () => {
  test("bucketOf uses the upper bounds inclusively", () => {
    expect(bucketOf(8)).toBe(0);
    expect(bucketOf(20)).toBe(0);
    expect(bucketOf(21)).toBe(1);
    expect(bucketOf(80)).toBe(BUCKETS.length - 1);
  });

  test("a level draws every bucket up to its longest sentence", () => {
    expect(levelBuckets("N5")).toEqual([0]);
    expect(levelBuckets("N3")).toEqual([0, 1, 2]);
    expect(levelBuckets("N1")).toEqual([0, 1, 2, 3, 4]);
    for (const level of ["N5", "N4", "N3", "N2", "N1", "native"] as const) {
      const last = levelBuckets(level).at(-1) as number;
      expect(BUCKETS[last] as number).toBe(LEVEL_MAX_KANA[level]);
    }
  });
});

describe("drawPassage", () => {
  test("joins sentences until ~90% of the length", () => {
    let n = 0;
    const p = drawPassage("N5", 30, () => sentence(10, `s${++n}`));
    expect(n).toBe(3);
    expect(p.translation).toBe("s1 s2 s3");
    expect(p.tokens).toHaveLength(9);
    expect(p.source).toBe("tatoeba");
  });

  test("stops when the sentences run out", () => {
    const left = [sentence(5, "only")];
    const p = drawPassage("N5", 100, () => left.pop());
    expect(p.translation).toBe("only");
  });
});
