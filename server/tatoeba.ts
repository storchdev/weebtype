// Offline fallback passages built from the Tatoeba sentences embedded in Jitendex
// (examples.json): each sentence is already split into furigana segments.

import { isKana, isKatakana, isPunct, normalizePunct, toHiragana } from "../src/lib/core/kana.ts";
import { drawPassage, LEVEL_MAX_KANA, type Sentence } from "../src/lib/core/sentences.ts";
import type { Level, Passage, Token } from "../src/lib/core/types.ts";
import type { RawExamples } from "./dictionary.ts";
import { countKana } from "./normalize.ts";

/** Convert example segments to tokens; returns null if something isn't typeable. */
export function toTokens(segs: Array<{ t: string; r?: string }>): Token[] | null {
  const tokens: Token[] = [];
  let kanaRun = "";
  const flush = () => {
    if (kanaRun) tokens.push({ groups: [{ t: kanaRun, r: kanaRun }] });
    kanaRun = "";
  };
  // Adjacent ruby segments are per-kanji furigana of one word (彼|女 → 彼女), so they
  // become one token with a group per segment.
  let prevRuby = false;
  for (const s of segs) {
    if (s.r) {
      flush();
      if (![...s.r].every(isKana)) return null;
      const group = { t: s.t, r: toHiragana(s.r) };
      const last = tokens[tokens.length - 1];
      if (prevRuby && last) last.groups.push(group);
      else tokens.push({ groups: [group] });
      prevRuby = true;
      continue;
    }
    prevRuby = false;
    for (const raw of s.t) {
      const ch = normalizePunct(raw);
      if (isPunct(ch)) {
        flush();
        tokens.push({ groups: [{ t: ch, r: ch }] });
      } else if (isKana(ch)) {
        // Split runs where the script changes (コーヒーは → コーヒー | は).
        const last = kanaRun.slice(-1);
        if (last && isKatakana(last) !== isKatakana(ch)) flush();
        kanaRun += ch;
      } else return null; // unread kanji, latin, digits, spaces...
    }
  }
  flush();
  return tokens;
}

export class Tatoeba {
  /** Every typeable sentence (8–80 kana), unannotated. */
  readonly sentences: Sentence[] = [];

  constructor(examples: RawExamples) {
    const seen = new Set<string>();
    for (const term in examples) {
      for (const { e } of examples[term] ?? []) {
        for (const ex of e) {
          if (seen.has(ex.t)) continue;
          seen.add(ex.t);
          const tokens = toTokens(ex.j);
          if (!tokens || tokens.length < 3) continue;
          const kana = countKana(tokens);
          if (kana < 8 || kana > 80) continue;
          this.sentences.push({ tokens, kana, translation: ex.t });
        }
      }
    }
  }

  get size(): number {
    return this.sentences.length;
  }

  passage(level: Level, length: number): Passage {
    const pool = this.sentences.filter((s) => s.kana <= LEVEL_MAX_KANA[level]);
    return drawPassage(level, length, () => pool[Math.floor(Math.random() * pool.length)]);
  }
}

export const BUILTIN: Passage = {
  id: "builtin",
  source: "builtin",
  level: "N5",
  translation: "This morning I ate bread at home. Then I went to school by train.",
  tokens: [
    { groups: [{ t: "今朝", r: "けさ" }] },
    { groups: [{ t: "、", r: "、" }] },
    { groups: [{ t: "家", r: "いえ" }] },
    { groups: [{ t: "で", r: "で" }] },
    { groups: [{ t: "パン", r: "パン" }] },
    { groups: [{ t: "を", r: "を" }] },
    {
      groups: [
        { t: "食", r: "た" },
        { t: "べました", r: "べました" },
      ],
    },
    { groups: [{ t: "。", r: "。" }] },
    { groups: [{ t: "それから", r: "それから" }] },
    { groups: [{ t: "、", r: "、" }] },
    { groups: [{ t: "電車", r: "でんしゃ" }] },
    { groups: [{ t: "で", r: "で" }] },
    {
      groups: [
        { t: "学", r: "がっ" },
        { t: "校", r: "こう" },
      ],
    },
    { groups: [{ t: "へ", r: "へ" }] },
    {
      groups: [
        { t: "行", r: "い" },
        { t: "きました", r: "きました" },
      ],
    },
    { groups: [{ t: "。", r: "。" }] },
  ],
};
