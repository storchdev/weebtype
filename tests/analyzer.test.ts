import { describe, expect, test } from "bun:test";
import { analyze, fillReadings, type Morpheme, tokensFromMorphemes } from "../server/analyzer.ts";
import type { RawToken } from "../server/normalize.ts";

const m = (surface: string, reading: string | undefined, pos: string, detail = "*"): Morpheme => ({
  surface,
  reading,
  pos,
  detail,
});

const text = (t: RawToken) => t.groups.map((g) => g.t).join("");

describe("tokensFromMorphemes", () => {
  test("conjugated predicates stay one token, particles and nouns don't attach", () => {
    const { tokens, unknown } = tokensFromMorphemes([
      m("猫", "ネコ", "名詞", "一般"),
      m("は", "ハ", "助詞", "係助詞"),
      m("食べ", "タベ", "動詞", "自立"),
      m("て", "テ", "助詞", "接続助詞"),
      m("い", "イ", "動詞", "非自立"),
      m("まし", "マシ", "助動詞"),
      m("た", "タ", "助動詞"),
      m("。", "。", "記号", "句点"),
    ]);
    expect(tokens.map(text)).toEqual(["猫", "は", "食べていました", "。"]);
    expect(tokens[0]?.groups).toEqual([{ t: "猫", r: "ねこ" }]);
    expect(tokens[2]?.groups[0]).toEqual({ t: "食べ", r: "たべ" });
    expect(unknown).toEqual([]);
  });

  test("だ after a noun is its own token; kana surfaces are their own reading", () => {
    const { tokens } = tokensFromMorphemes([m("龍", "リュウ", "名詞", "一般"), m("だ", "ダ", "助動詞")]);
    expect(tokens.map(text)).toEqual(["龍", "だ"]);
    // は is read ハ by IPAdic; typed as written.
    const ha = tokensFromMorphemes([m("は", "ハ", "助詞", "係助詞")]).tokens;
    expect(ha[0]?.groups).toEqual([{ t: "は", r: "は" }]);
  });

  test("katakana words keep katakana readings", () => {
    const { tokens } = tokensFromMorphemes([m("コーヒー", "コーヒー", "名詞", "一般")]);
    expect(tokens[0]?.groups).toEqual([{ t: "コーヒー", r: "コーヒー" }]);
  });

  test("punctuation is normalised into its own tokens, other symbols are dropped", () => {
    const { tokens } = tokensFromMorphemes([
      m('"', undefined, "記号", "一般"),
      m("「", "「", "記号", "括弧開"),
      m("よし", "ヨシ", "副詞", "一般"),
      m("!", undefined, "記号", "一般"),
      m("」", "」", "記号", "括弧閉"),
    ]);
    expect(tokens.map(text)).toEqual(["「", "よし", "！", "」"]);
  });

  test("unknown kanji words get an empty reading and are listed", () => {
    const { tokens, unknown } = tokensFromMorphemes([m("瑠璃丸", undefined, "名詞", "固有名詞")]);
    expect(unknown).toEqual(["瑠璃丸"]);
    fillReadings(tokens, new Map([["瑠璃丸", "ルリマル"]]));
    expect(tokens[0]?.groups).toEqual([{ t: "瑠璃丸", r: "るりまる" }]);
  });
});

describe("analyze (kuromoji + IPAdic)", () => {
  test("reads words the local model got wrong", async () => {
    const { tokens, unknown } = await analyze("老夫婦が営む喫茶店で、鳴り響く風鈴を待ち遠しく思った。");
    const reading = tokens.flatMap((t) => t.groups.map((g) => g.r)).join("");
    expect(reading).toBe("ろうふうふがいとなむきっさてんで、なりひびくふうりんをまちどおしくおもった。");
    expect(tokens.map(text)).toContain("思った");
    expect(unknown).toEqual([]);
  });

  test("一人 and 二人 are read ひとり / ふたり, other counts stay on'yomi", async () => {
    const { tokens } = await analyze("二人と一人と三人");
    expect(tokens.map((t) => t.groups.map((g) => `${g.t}/${g.r}`).join(" "))).toEqual([
      "二人/ふたり",
      "と/と",
      "一人/ひとり",
      "と/と",
      "三/さん",
      "人/にん",
    ]);
  });
});
