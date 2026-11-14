import { describe, expect, test } from "bun:test";
import { accentContour, accentMelody, downstepFor, noteName } from "../src/lib/core/accent.ts";
import type { DictEntry, Token } from "../src/lib/core/types.ts";

const entry = (
  term: string,
  reading: string,
  pitch: number | null,
  deinflectedFrom: string | null = null,
): DictEntry => ({
  term,
  reading,
  pitch,
  tags: [],
  defs: [],
  example: null,
  deinflectedFrom,
});
const tok = (r: string, e?: DictEntry, t = r): Token => ({ groups: [{ t, r }], ...(e ? { dict: [e] } : {}) });

/** H/L string per mora-ish char: compares each char to the previous. */
const shape = (tokens: Token[]) => {
  const c = accentContour(tokens);
  return c.map((v) => (v >= 4 ? "H" : "L")).join("");
};

describe("downstepFor", () => {
  test("dictionary form uses the Kanjium value", () => {
    expect(downstepFor("たべる", entry("食べる", "たべる", 2))).toBe(2);
  });
  test("te/ta forms of accented verbs", () => {
    expect(downstepFor("たべて", entry("食べる", "たべる", 2, "食べて"))).toBe(1);
    expect(downstepFor("はなして", entry("話す", "はなす", 2, "話して"))).toBe(2);
    expect(downstepFor("かえった", entry("帰る", "かえる", 1, "帰った"))).toBe(1);
    expect(downstepFor("しらべて", entry("調べる", "しらべる", 3, "調べて"))).toBe(2);
    expect(downstepFor("かいて", entry("書く", "かく", 1, "書いて"))).toBe(1);
    expect(downstepFor("あそんで", entry("遊ぶ", "あそぶ", 0, "遊んで"))).toBe(0);
  });
  test("polite forms put the accent on ま / せ", () => {
    expect(downstepFor("たべます", entry("食べる", "たべる", 2, "食べます"))).toBe(3);
    expect(downstepFor("あそびません", entry("遊ぶ", "あそぶ", 0, "遊びません"))).toBe(5);
  });
  test("negative and adjectives", () => {
    expect(downstepFor("たべない", entry("食べる", "たべる", 2, "食べない"))).toBe(2);
    expect(downstepFor("たかかった", entry("高い", "たかい", 2, "高かった"))).toBe(1);
  });
  test("unknown words: loanwords antepenultimate, else heiban", () => {
    expect(downstepFor("テレビ", undefined)).toBe(1);
    expect(downstepFor("コンピューター", undefined)).toBe(3);
    expect(downstepFor("さくら", undefined)).toBe(0);
  });
});

describe("accentContour", () => {
  test("heiban word keeps the particle high; odaka drops it", () => {
    expect(shape([tok("さかな", entry("魚", "さかな", 0), "魚"), tok("が", entry("蛾", "が", 1))])).toBe(
      "LHHH",
    );
    expect(shape([tok("やま", entry("山", "やま", 2), "山"), tok("が")])).toBe("LHL");
  });
  test("atamadaka drops after the first mora", () => {
    expect(shape([tok("てんき", entry("天気", "てんき", 1), "天気"), tok("は", entry("葉", "は", 1))])).toBe(
      "HLLL",
    );
  });
  test("です drops only if nothing dropped yet", () => {
    expect(shape([tok("きれい", entry("綺麗", "きれい", 1), "綺麗"), tok("です")])).toBe("HLLLL");
    expect(shape([tok("さかな", entry("魚", "さかな", 0), "魚"), tok("です")])).toBe("LHHHL");
  });
  test("one value per target char, small kana included", () => {
    const t = [tok("きょう", entry("今日", "きょう", 1), "今日"), tok("、"), tok("ちゃ")];
    expect(accentContour(t)).toHaveLength(6);
  });
  test("catathesis lowers the next phrase, sentence end resets", () => {
    const c = accentContour([
      tok("てんき", entry("天気", "てんき", 1), "天気"),
      tok("さかな", entry("魚", "さかな", 0), "魚"),
      tok("。"),
      tok("さかな", entry("魚", "さかな", 0), "魚"),
    ]);
    expect(c[4]).toBeLessThan(c[8] as number);
  });
  test("okurigana token sharing the entry joins the word", () => {
    const e = entry("歩く", "あるく", 2, "歩いて");
    // 歩|いて → あるいて, godan te-form keeps accent 2 (aru^ite)
    expect(shape([tok("ある", e, "歩"), tok("いて", e)])).toBe("LHLL");
  });
});

describe("accentMelody", () => {
  const PENT = new Set([0, 2, 4, 7, 9]);
  const inKey = (semisFromA4: number, low = -7) => PENT.has((((semisFromA4 - low) % 12) + 12) % 12);
  const passage = [
    tok("てんき", entry("天気", "てんき", 1), "天気"),
    tok("が"),
    tok("いい"),
    tok("ので"),
    tok("、"),
    tok("さかな", entry("魚", "さかな", 0), "魚"),
    tok("を"),
    tok("たべます", entry("食べる", "たべる", 2, "食べます"), "食べます"),
    tok("。"),
  ];
  test("every note is in the major pentatonic of the lowest note", () => {
    for (const n of accentMelody(passage)) expect(inKey(n)).toBe(true);
  });
  test("keeps the accent shape: rises and drops in the same places", () => {
    const m = accentMelody(passage);
    const c = accentContour(passage);
    for (let i = 1; i < c.length; i++) {
      const sameWordish = Math.sign((c[i] as number) - (c[i - 1] as number));
      const mel = Math.sign((m[i] as number) - (m[i - 1] as number));
      // within a phrase the melody moves in the contour's direction
      // (the melody bottoms out after a drop where speech keeps sinking a little)
      if (sameWordish !== 0 && i !== 5 && i !== 9 && i !== 10) {
        expect(mel === sameWordish || (sameWordish < 0 && mel === 0)).toBe(true);
      }
    }
  });
  test("stays inside the voice range (default and custom)", () => {
    for (const range of [undefined, { low: -4, high: 10 }, { low: -12, high: -3 }, { low: 0, high: 24 }]) {
      const m = accentMelody(passage, range);
      const r = range ?? { low: -7, high: 7 };
      for (const n of m) {
        expect(n).toBeGreaterThanOrEqual(r.low);
        expect(n).toBeLessThanOrEqual(r.high);
        expect(inKey(n, r.low)).toBe(true);
      }
    }
  });
  test("noteName", () => {
    expect(noteName(0)).toBe("A4");
    expect(noteName(-7)).toBe("D4");
    expect(noteName(3)).toBe("C5");
    expect(noteName(-10)).toBe("B3");
  });
});
