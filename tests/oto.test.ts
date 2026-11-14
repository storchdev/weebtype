import { describe, expect, test } from "bun:test";
import { characterName, noteHz, OtoIndex, parseOto, pitchTag } from "../src/lib/core/oto.ts";
import { type Syllable, syllables } from "../src/lib/core/voice.ts";

const OTO = [
  "ka.wav=か,45,90,-300,70,20",
  "a.wav=,30,10,-250,10,5",
  "_かさ.wav=- さ,10,80,-280,60,10",
  "_かさ.wav=a か,300,80,-280,60,10",
  "readme.txt=x",
].join("\r\n");

test("parses entries, defaulting the alias to the file name", () => {
  const e = parseOto(OTO, "C4");
  expect(e).toHaveLength(4);
  expect(e[0]).toEqual({
    file: "C4/ka.wav",
    alias: "か",
    offset: 45,
    consonant: 90,
    cutoff: -300,
    preutter: 70,
    overlap: 20,
  });
  expect(e[1]?.alias).toBe("a");
});

test("finds samples by kana, romaji, phrase-initial or VCV alias", () => {
  const idx = new OtoIndex(parseOto(OTO));
  const find = (k: string, prev: Parameters<typeof syllables>[1] = null) =>
    idx.find(syllables(k, prev)[0] as Syllable)?.alias;
  expect(find("か")).toBe("か");
  expect(find("カ")).toBe("か");
  expect(find("さ")).toBe("- さ");
  expect(find("ー", "a")).toBe("a");
  expect(idx.find(syllables("っ")[0] as Syllable)).toBeNull();
});

test("character name", () => {
  expect(characterName("name=テスト\r\nimage=x.bmp")).toBe("テスト");
});

test("pitch/expression suffixes are stripped, plain aliases win", () => {
  const idx = new OtoIndex(
    parseOto(["kaS.wav=- かSA4,1,1,1,1,1", "ka.wav=- か,1,1,1,1,1", "sa.wav=a さA4,1,1,1,1,1"].join("\n")),
  );
  expect(idx.find(syllables("か")[0] as Syllable)?.file).toBe("ka.wav");
  expect(idx.find(syllables("さ")[0] as Syllable)?.file).toBe("sa.wav");
});

describe("pitch sets", () => {
  test("noteHz", () => {
    expect(noteHz("A4")).toBe(440);
    expect(noteHz("D5")).toBeCloseTo(587.33, 1);
    expect(noteHz("S")).toBeNull();
  });
  test("pitchTag: suffix, folder, expression", () => {
    expect(pitchTag("- かA4", "Kumi/_Core_A4")).toBe("A4");
    expect(pitchTag("- か", "Kumi/_Core_D5")).toBe("D5");
    expect(pitchTag("- か", "Kumi/_Core")).toBeNull();
    expect(pitchTag("a かS", "Kumi/_Strong_Low")).toBe("expression");
    expect(pitchTag("a かW", "Kumi/_Whisper_High")).toBe("expression");
  });
  test("find picks the set recorded nearest the target", () => {
    const e = (alias: string, pitch?: string) => ({
      file: `${pitch ?? "main"}/ka.wav`,
      alias,
      offset: 0,
      consonant: 0,
      cutoff: 0,
      preutter: 0,
      overlap: 0,
      ...(pitch ? { pitch } : {}),
    });
    const idx = new OtoIndex([e("- か"), e("- かA4", "A4"), e("- かD5", "D5")]);
    const ka = syllables("か", null)[0] as Syllable;
    expect(idx.find(ka)?.file).toBe("main/ka.wav");
    expect(idx.find(ka, 300, 294)?.file).toBe("main/ka.wav");
    expect(idx.find(ka, 450, 294)?.file).toBe("A4/ka.wav");
    expect(idx.find(ka, 700, 294)?.file).toBe("D5/ka.wav");
  });
});
