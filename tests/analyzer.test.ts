import { describe, expect, test } from "bun:test";
import {
  analyze,
  fillReadings,
  joinCountReadings,
  type Morpheme,
  tokensFromMorphemes,
  type WordReadings,
} from "../server/analyzer.ts";
import { Dictionary } from "../server/dictionary.ts";
import type { RawToken } from "../server/normalize.ts";

const m = (
  surface: string,
  reading: string | undefined,
  pos: string,
  detail = "*",
  detail2 = "*",
): Morpheme => ({
  surface,
  reading,
  pos,
  detail,
  detail2,
});
const num = (surface: string, reading: string) => m(surface, reading, "名詞", "数");
const counter = (surface: string, reading: string) => m(surface, reading, "名詞", "接尾", "助数詞");
const readings = (t: RawToken[]) => t.map((x) => x.groups.map((g) => `${g.t}/${g.r}`).join(" "));
const fakeWords =
  (table: Record<string, Array<[string, number]>>): WordReadings =>
  (w) =>
    (table[w] ?? []).map(([r, s]) => ({ r, s }));

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

describe("compounds the analyzer reads piece by piece", () => {
  test("take the dictionary's most common whole-word reading", () => {
    const words = fakeWords({
      一人: [
        ["ひとり", 200],
        ["いちにん", 97],
      ],
      一日中: [["いちにちじゅう", 200]],
    });
    const { tokens } = tokensFromMorphemes(
      [
        num("一", "イチ"),
        counter("人", "ニン"),
        num("一", "イチ"),
        counter("日", "ニチ"),
        m("中", "チュウ", "名詞", "接尾"),
      ],
      words,
    );
    expect(readings(tokens)).toEqual(["一人/ひとり", "一日中/いちにちじゅう"]);
  });

  test("ties go to the analyzer's reading", () => {
    const words = fakeWords({
      何人: [
        ["なにびと", 200],
        ["なんにん", 200],
      ],
    });
    const { tokens } = tokensFromMorphemes([num("何", "ナン"), counter("人", "ニン")], words);
    expect(readings(tokens)).toEqual(["何人/なんにん"]);
  });

  test("分 split off as a counter means minutes, not じゅうぶん / いちぶ", () => {
    const words = fakeWords({
      十分: [
        ["じゅうぶん", 200],
        ["じゅっぷん", -1],
      ],
      一分: [["いちぶ", 200]],
    });
    const { tokens } = tokensFromMorphemes(
      [
        num("十", "ジュウ"),
        counter("分", "フン"),
        m("、", "、", "記号"),
        num("一", "イチ"),
        counter("分", "フン"),
      ],
      words,
    );
    expect(readings(tokens)).toEqual(["十分/じゅっぷん", "、/、", "一分/いっぷん"]);
  });

  test("一日 after a month is the date", () => {
    const words = fakeWords({
      一日: [
        ["いちにち", 200],
        ["ついたち", 199],
      ],
    });
    const { tokens } = tokensFromMorphemes(
      [m("四月", "シガツ", "名詞", "副詞可能"), num("一", "イチ"), counter("日", "ニチ")],
      words,
    );
    expect(readings(tokens)).toEqual(["四月/しがつ", "一日/ついたち"]);
  });

  test("dictionary spans never end inside a count; unlisted counts use sound rules", () => {
    const words = fakeWords({ 二十: [["にじゅう", 200]] });
    const { tokens } = tokensFromMorphemes(
      [num("二", "ニ"), num("十", "ジュウ"), counter("分", "フン")],
      words,
    );
    expect(readings(tokens)).toEqual(["二十分/にじゅっぷん"]);
  });

  test("kana pieces and particles are never joined", () => {
    const words = fakeWords({ 私たち: [["わたしたち", 200]] });
    const { tokens } = tokensFromMorphemes(
      [
        m("私", "ワタシ", "名詞", "代名詞"),
        m("たち", "タチ", "名詞", "接尾"),
        m("の", "ノ", "助詞", "連体化"),
      ],
      words,
    );
    expect(tokens.map(text)).toEqual(["私", "たち", "の"]);
  });

  test("without a dictionary, 一人/二人 are still read ひとり/ふたり", () => {
    const { tokens } = tokensFromMorphemes([num("二", "ニ"), counter("人", "ニン")]);
    expect(readings(tokens)).toEqual(["二人/ふたり"]);
  });
});

describe("joinCountReadings", () => {
  test("regular sound changes between a number and its counter", () => {
    expect(joinCountReadings(["いち", "ほん"])).toBe("いっぽん");
    expect(joinCountReadings(["さん", "ほん"])).toBe("さんぼん");
    expect(joinCountReadings(["ろく", "かい"])).toBe("ろっかい");
    expect(joinCountReadings(["ろく", "さつ"])).toBe("ろくさつ");
    expect(joinCountReadings(["はち", "さつ"])).toBe("はっさつ");
    expect(joinCountReadings(["に", "じゅう", "ふん"])).toBe("にじゅっぷん");
    expect(joinCountReadings(["よん", "ふん"])).toBe("よんぷん");
    expect(joinCountReadings(["さん", "はく"])).toBe("さんぱく");
    expect(joinCountReadings(["いち", "まい"])).toBe("いちまい");
  });

  test("inside numbers too", () => {
    expect(joinCountReadings(["さん", "ひゃく", "えん"])).toBe("さんびゃくえん");
    expect(joinCountReadings(["はち", "ひゃく"])).toBe("はっぴゃく");
    expect(joinCountReadings(["さん", "せん"])).toBe("さんぜん");
    expect(joinCountReadings(["じゅう", "いち"])).toBe("じゅういち");
  });
});

const dict = await Dictionary.load();

describe.skipIf(!dict)("analyze with Jitendex", () => {
  test("counts, dates and suffix compounds read as whole words", async () => {
    const words: WordReadings = (w) => dict?.writtenReadings(w) ?? [];
    const { tokens } = await analyze("二十歳の誕生日は四月一日で、一日中、午前中に十分待った。", words);
    const r = tokens.flatMap((t) => t.groups.map((g) => g.r)).join("");
    expect(r).toBe(
      "はたちのたんじょうびはしがつついたちで、いちにちじゅう、ごぜんちゅうにじゅっぷんまった。",
    );
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

  test("counts are one word; 一人 and 二人 are ひとり / ふたり even without a dictionary", async () => {
    const { tokens } = await analyze("二人と一人と三人");
    expect(readings(tokens)).toEqual(["二人/ふたり", "と/と", "一人/ひとり", "と/と", "三人/さんにん"]);
  });
});
