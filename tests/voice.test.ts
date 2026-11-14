import { describe, expect, test } from "bun:test";
import { longVowelMask, Melody, SCALE, syllables } from "../src/lib/core/voice.ts";

const brief = (t: string, prev: Parameters<typeof syllables>[1] = null) =>
  syllables(t, prev).map((s) => `${s.onset}:${s.consonant}:${s.vowel}`);

describe("syllables", () => {
  test("vowels and onsets", () => {
    expect(brief("あか")).toEqual(["none::a", "plosive:k:a"]);
    expect(brief("しつ")).toEqual(["fricative:sh:i", "affricate:ts:u"]);
    expect(brief("ざがまらや")).toEqual(["buzz:z:a", "voiced:g:a", "nasal:m:a", "liquid:r:a", "glideY:y:a"]);
    expect(brief("わ")).toEqual(["glideW:w:a"]);
  });

  test("yōon is one syllable", () => {
    expect(brief("きゃ")).toEqual(["plosive:ky:a"]);
    expect(syllables("しょ")[0]?.kana).toBe("しょ");
  });

  test("katakana sings the same", () => {
    expect(brief("カ")).toEqual(brief("か"));
  });

  test("ん hums, っ is a silent beat", () => {
    expect(brief("ん")).toEqual(["nasal:n:n"]);
    expect(brief("っ")).toEqual(["none::null"]);
  });

  test("ー continues the previous vowel, even across calls", () => {
    expect(brief("らー")).toEqual(["liquid:r:a", "none::a"]);
    expect(brief("ー", "o")).toEqual(["none::o"]);
    expect(brief("ー")).toEqual([]);
  });

  test("punctuation and latin are skipped", () => {
    expect(brief("、。「」？")).toEqual([]);
    expect(brief("7")).toEqual([]);
  });
});

describe("melody", () => {
  test("stays on the scale", () => {
    let s = 1;
    const rng = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const m = new Melody(rng);
    for (let i = 0; i < 500; i++) expect(SCALE).toContain(m.next() as (typeof SCALE)[number]);
  });

  test("cadence lands on a tonic", () => {
    // rng < 0.12 → a step of 0, so the next note is the cadence note itself
    const m = new Melody(() => 0.05);
    m.cadence();
    expect([0, 12]).toContain(m.next());
  });
});

test("long vowels hold only where allowed", () => {
  const yes = () => true;
  expect(syllables("じゅう", null, yes).map((s) => [s.kana, s.vowel, !!s.hold])).toEqual([
    ["じゅ", "u", false],
    ["う", "u", true],
  ]);
  // across separate calls (typed one kana at a time)
  expect(syllables("う", "o", yes)[0]?.hold).toBe(true);
  expect(syllables("い", "e", yes)[0]).toMatchObject({ vowel: "e", hold: true });
  expect(syllables("い", "a", yes)[0]?.hold).toBeFalsy();
  // by default vowels are sung as written; ー always holds
  expect(syllables("せい")[1]).toMatchObject({ vowel: "i", from: "e" });
  expect(syllables("ー", "a")[0]?.hold).toBe(true);
});

test("longVowelMask: only inside one kanji's reading", () => {
  const tk = (...groups: Array<[string, string]>) => ({ groups: groups.map(([t, r]) => ({ t, r })) });
  // 先生 せん|せい → い of せい; 毛色 け|いろ → nothing; kana いう → nothing; 中 じゅう → う
  const mask = longVowelMask([
    tk(["先", "せん"], ["生", "せい"]),
    tk(["毛", "け"], ["色", "いろ"]),
    tk(["いう", "いう"]),
    tk(["中", "じゅう"]),
  ]);
  const target = "せんせいけいろいうじゅう";
  expect([...target].filter((_, i) => mask[i]).join("")).toBe("いう");
  expect(mask[3]).toBe(true); // せい's い
  expect(mask[11]).toBe(true); // じゅう's う
});

test("diphthongs and ん glide from the vowel before them", () => {
  const s = syllables("たいさんあお");
  expect(s.map((x) => x.from ?? "-")).toEqual(["-", "a", "-", "a", "-", "a"]);
  // after ん nothing glides
  expect(syllables("んい")[1]?.from).toBeUndefined();
});
