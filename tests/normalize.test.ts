import { describe, expect, test } from "bun:test";
import {
  nameEntry,
  normalizeTokens,
  sentenceEnds,
  splitOkurigana,
  translationFor,
  trimToLength,
} from "../server/normalize.ts";

describe("splitOkurigana", () => {
  test("splits kana runs", () => {
    expect(splitOkurigana({ t: "食べ物", r: "たべもの" })).toEqual([
      { t: "食", r: "た" },
      { t: "べ", r: "べ" },
      { t: "物", r: "もの" },
    ]);
  });
  test("leaves unalignable groups", () => {
    expect(splitOkurigana({ t: "今日", r: "きょう" })).toEqual([{ t: "今日", r: "きょう" }]);
  });
});

describe("normalizeTokens", () => {
  test("punctuation and kana-only groups", () => {
    const r = normalizeTokens(
      [
        { groups: [{ t: "猫", r: "ねこ" }] },
        { groups: [{ t: "が", r: "x" }] },
        { groups: [{ t: "。", r: "" }] },
      ],
      null,
    );
    expect(r.tokens).toEqual([
      { groups: [{ t: "猫", r: "ねこ" }] },
      { groups: [{ t: "が", r: "が" }] },
      { groups: [{ t: "。", r: "。" }] },
    ]);
    expect(r.problems).toEqual([]);
    expect(r.kana).toBe(4);
  });

  test("half-width punctuation is normalised and split off", () => {
    const r = normalizeTokens([{ groups: [{ t: "猫,", r: "ねこ" }] }], null);
    expect(r.tokens.map((t) => t.groups.map((g) => g.t).join(""))).toEqual(["猫", "、"]);
  });

  test("katakana readings become hiragana for kanji words", () => {
    const r = normalizeTokens([{ groups: [{ t: "猫", r: "ネコ" }] }], null);
    expect(r.tokens[0]?.groups[0]?.r).toBe("ねこ");
  });

  test("reading mismatch is reported", () => {
    const checker = { readingsFor: (s: string) => (s === "猫" ? new Set(["ねこ"]) : null) };
    const r = normalizeTokens([{ groups: [{ t: "猫", r: "いぬ" }] }], checker);
    expect(r.problems.length).toBe(1);
  });
});

test("trimToLength cuts at a sentence end", () => {
  const sentence = [{ groups: [{ t: "あいうえお", r: "あいうえお" }] }, { groups: [{ t: "。", r: "。" }] }];
  const tokens = [...sentence, ...sentence, ...sentence, ...sentence];
  expect(trimToLength(tokens, 10).length).toBe(4);
});

test("trimToLength keeps the closing quote and never cuts inside one", () => {
  const tok = (t: string, r = t) => ({ groups: [{ t, r }] });
  // 「あいうえおかきくけこ。さしすせそ。」たちつてと。
  const tokens = [
    tok("「"),
    tok("あいうえおかきくけこ"),
    tok("。"),
    tok("さしすせそ"),
    tok("。"),
    tok("」"),
    tok("たちつてと"),
    tok("。"),
  ];
  const cut = trimToLength(tokens, 10);
  expect(cut.map((t) => t.groups[0]?.t).join("")).toBe("「あいうえおかきくけこ。さしすせそ。」");
});

describe("translations follow the trim", () => {
  const tok = (t: string, r = t) => ({ groups: [{ t, r }] });
  const s1 = [tok("ねこ"), tok("。")];
  const s2 = [tok("「"), tok("いぬ"), tok("。"), tok("」"), tok("と"), tok("いった"), tok("。")];
  const s3 = [tok("とり"), tok("！")];
  const all = [...s1, ...s2, ...s3];
  test("sentence ends skip 。 inside quotes", () => {
    expect(sentenceEnds(all)).toEqual([1, 8, 10]);
  });
  test("keeps only the kept sentences' English", () => {
    expect(translationFor(["Cat.", '"Dog," he said.', "Bird!"], all, [...s1, ...s2])).toBe(
      'Cat. "Dog," he said.',
    );
    expect(translationFor(["Cat.", '"Dog," he said.', "Bird!"], all, all)).toBe('Cat. "Dog," he said. Bird!');
  });
  test("count mismatch: whole passage keeps it, a trimmed one drops it", () => {
    expect(translationFor(["Cat. Dog. Bird."], all, all)).toBe("Cat. Dog. Bird.");
    expect(translationFor(["Cat. Dog. Bird."], all, s1)).toBe("");
  });
});

test("nameEntry glosses names the dictionary lacks", () => {
  const names = [{ w: "健太", en: "Kenta (male given name)" }];
  expect(nameEntry("健太", "けんた", names)).toMatchObject({
    term: "健太",
    reading: "けんた",
    tags: ["name"],
    defs: ["Kenta (male given name)"],
  });
  expect(nameEntry("山田", "やまだ", names)).toBeNull();
  expect(nameEntry("健太", "けんた", [{ w: "健太", en: " " }])).toBeNull();
});
