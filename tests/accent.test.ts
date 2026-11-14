import { describe, expect, test } from "bun:test";
import { accentContour, downstepFor } from "../src/lib/core/accent.ts";
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
