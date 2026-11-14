import { expect, test } from "bun:test";
import { toTokens } from "../server/tatoeba.ts";

test("adjacent ruby segments form one word token", () => {
  const t = toTokens([
    { t: "彼", r: "かの" },
    { t: "女", r: "じょ" },
    { t: "は" },
    { t: "彼", r: "かれ" },
    { t: "。" },
  ]);
  expect(t?.map((x) => x.groups.map((g) => g.t).join(""))).toEqual(["彼女", "は", "彼", "。"]);
  expect(t?.[0]?.groups).toEqual([
    { t: "彼", r: "かの" },
    { t: "女", r: "じょ" },
  ]);
});

test("kana between ruby segments separates words", () => {
  const t = toTokens([{ t: "私", r: "わたし" }, { t: "の" }, { t: "本", r: "ほん" }]);
  expect(t?.length).toBe(3);
});

const hasData = await Bun.file(new URL("../data/dictionary.json", import.meta.url)).exists();

test.skipIf(!hasData)(
  "annotate resolves bare-kanji stems through their okurigana",
  async () => {
    const { Dictionary } = await import("../server/dictionary.ts");
    const { PassageService } = await import("../server/passages.ts");
    const svc = new PassageService();
    svc.dict = await Dictionary.load();
    const toks = toTokens([{ t: "歩", r: "ある" }, { t: "いて" }, { t: "本", r: "ほん" }, { t: "の" }]) ?? [];
    const terms = svc.annotate(toks).map((t) => t.dict?.[0]?.term);
    expect(terms).toEqual(["歩く", "歩く", "本", "の"]);
  },
  30000,
);
