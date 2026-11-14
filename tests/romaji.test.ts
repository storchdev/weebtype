import { describe, expect, test } from "bun:test";
import { RomajiEngine } from "../src/lib/core/romaji.ts";

function typeAll(target: string, keys: string): { ok: boolean; done: boolean; failedAt: number } {
  const e = new RomajiEngine(target);
  for (let i = 0; i < keys.length; i++) {
    if (!e.press(keys[i] as string).ok) return { ok: false, done: e.done, failedAt: i };
  }
  return { ok: true, done: e.done, failedAt: -1 };
}

function accepts(target: string, keys: string): boolean {
  const r = typeAll(target, keys);
  return r.ok && r.done;
}

describe("romaji engine", () => {
  test("basic hiragana", () => {
    expect(accepts("たべる", "taberu")).toBe(true);
    expect(accepts("ありがとう", "arigatou")).toBe(true);
  });

  test("variant spellings", () => {
    for (const k of ["shi", "si", "ci"]) expect(accepts("し", k)).toBe(true);
    for (const k of ["tsu", "tu"]) expect(accepts("つ", k)).toBe(true);
    for (const k of ["chi", "ti"]) expect(accepts("ち", k)).toBe(true);
    for (const k of ["fu", "hu"]) expect(accepts("ふ", k)).toBe(true);
    for (const k of ["ji", "zi"]) expect(accepts("じ", k)).toBe(true);
  });

  test("yoon direct and split", () => {
    for (const k of ["ja", "jya", "zya", "jixya", "zilya"]) expect(accepts("じゃ", k)).toBe(true);
    for (const k of ["kyou", "kixyou"]) expect(accepts("きょう", k)).toBe(true);
    expect(accepts("しゃしん", "shashinn")).toBe(true);
    expect(accepts("しゃしん", "syasinn")).toBe(true);
  });

  test("katakana is typed like hiragana, ー is -", () => {
    expect(accepts("コーヒー", "ko-hi-")).toBe(true);
    expect(accepts("ファイル", "fairu")).toBe(true);
  });

  test("ん rules", () => {
    expect(accepts("ほん", "honn")).toBe(true);
    expect(accepts("ほん", "hon'")).toBe(true);
    expect(accepts("ほん", "hon")).toBe(false); // ambiguous at end
    expect(accepts("さんぽ", "sanpo")).toBe(true);
    expect(accepts("さんぽ", "sannpo")).toBe(true);
    expect(accepts("こんや", "konnya")).toBe(true);
    expect(accepts("こんや", "konya")).toBe(false); // would be こにゃ
    expect(accepts("あんない", "annnai")).toBe(true);
    expect(accepts("せんえん", "sennenn")).toBe(true);
    expect(accepts("ほん。", "hon.")).toBe(true);
  });

  test("っ by doubling or explicit", () => {
    expect(accepts("きって", "kitte")).toBe(true);
    expect(accepts("きって", "kixtute")).toBe(true);
    expect(accepts("きって", "kiltsute")).toBe(true);
    expect(accepts("まっちゃ", "maccha")).toBe(true);
    expect(accepts("まっちゃ", "matcha")).toBe(true);
    expect(accepts("まっちゃ", "mattya")).toBe(true);
    expect(accepts("いっしょ", "issho")).toBe(true);
    expect(accepts("いっしょ", "issyo")).toBe(true);
  });

  test("punctuation", () => {
    expect(accepts("「はい」、いいえ。", "[hai],iie.")).toBe(true);
    expect(accepts("なに？", "nani?")).toBe(true);
  });

  test("wrong key is rejected without changing state", () => {
    const e = new RomajiEngine("か");
    expect(e.press("x").ok).toBe(false);
    expect(e.press("k").ok).toBe(true);
    expect(e.press("i").ok).toBe(false);
    expect(e.buffer).toBe("k");
    expect(e.press("a").ok).toBe(true);
    expect(e.done).toBe(true);
  });

  test("uppercase letters are accepted", () => {
    expect(accepts("か", "KA")).toBe(true);
  });

  test("kanaDone and guide", () => {
    const e = new RomajiEngine("しゃしん");
    expect(e.guide(0, 4)).toEqual({ typed: "", rest: "shashinn" });
    e.press("s");
    e.press("y");
    expect(e.kanaDone).toBe(0);
    expect(e.guide(0, 4)).toEqual({ typed: "sy", rest: "ashinn" });
    e.press("a");
    expect(e.kanaDone).toBe(2);
    expect(e.guide(0, 4)).toEqual({ typed: "sya", rest: "shinn" });
  });

  test("guide prefers single n before consonants and doubles for っ", () => {
    expect(new RomajiEngine("さんぽ").guide(0, 3).rest).toBe("sanpo");
    expect(new RomajiEngine("まっちゃ").guide(0, 4).rest).toBe("maccha");
  });
});

test("phonetic spellings of special kana pairs just work", () => {
  const typeAll = (target: string, keys: string) => {
    const e = new RomajiEngine(target);
    for (const k of keys) if (!e.press(k).ok) return false;
    return e.done;
  };
  for (const [t, k] of [
    ["ちゃ", "cha"],
    ["ディズニー", "dizuni-"],
    ["トゥ", "tu"],
    ["ドゥ", "du"],
    ["ぢゃ", "ja"],
    ["いぇ", "ye"],
    ["はなぢ", "hanaji"],
    ["つづく", "tsuzuku"],
    ["ほんを", "honwo"],
    ["ほんを", "hon'o"],
    ["ウォ", "wo"],
    ["ティー", "ti-"],
    ["クォ", "kwo"],
    ["スィ", "si"],
    ["まっちゃ", "matcha"],
  ] as const)
    expect(typeAll(t, k)).toBe(true);
});
