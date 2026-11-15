// Readings for LLM-written text from a morphological analyzer (kuromoji + IPAdic), used by
// the llama backend: small local models write fluent Japanese but unreliable furigana.

import { dirname, join } from "node:path";
import kuromoji from "kuromoji";
import { allKana, isKatakana, isPunct, normalizePunct, toHiragana } from "../src/lib/core/kana.ts";
import type { RawToken } from "./normalize.ts";

/** The parts of a kuromoji token we use. */
export interface Morpheme {
  surface: string;
  /** Katakana reading; absent for unknown words. */
  reading?: string;
  /** IPAdic part of speech and first detail (動詞 / 非自立). */
  pos: string;
  detail: string;
}

export interface Analysis {
  tokens: RawToken[];
  /** Surfaces with kanji (or other non-kana) the analyzer has no reading for, in order. */
  unknown: string[];
}

const JUKUJIKUN_PAIRS: Readonly<Record<string, string>> = { 一: "ヒトリ", 二: "フタリ" };

/** Morphemes that conjugate (their followers attach to them). */
function isInflecting(m: Morpheme): boolean {
  return m.pos === "動詞" || m.pos === "形容詞" || m.pos === "助動詞";
}

/**
 * Does `m` continue the previous word? Keeps conjugated predicates together as one token
 * (食べ|て|い|まし|た → 食べていました, 待ち遠しく|なかっ|た), like the LLM prompt asks.
 */
function attaches(m: Morpheme, prev: Morpheme | undefined): boolean {
  if (!prev) return false;
  const prevVerbal =
    isInflecting(prev) ||
    (prev.pos === "助詞" && prev.detail === "接続助詞" && /^[てで]$/u.test(prev.surface));
  if (!prevVerbal) return false;
  if (m.pos === "助動詞") return isInflecting(prev);
  if (m.pos === "助詞" && m.detail === "接続助詞" && /^[てで]$/u.test(m.surface)) return isInflecting(prev);
  if ((m.pos === "動詞" || m.pos === "形容詞") && (m.detail === "非自立" || m.detail === "接尾")) return true;
  return false;
}

/** Ruby group for one morpheme: kana is its own reading, katakana words keep katakana. */
function groupFor(m: Morpheme): { t: string; r: string } | null {
  if (allKana(m.surface)) return { t: m.surface, r: m.surface };
  const r = m.reading && m.reading !== "*" ? m.reading : "";
  if (!r || !allKana(r)) return null;
  return { t: m.surface, r: [...m.surface].every(isKatakana) ? r : toHiragana(r) };
}

/**
 * Turn analyzer output into tokens with one ruby group per morpheme (okurigana is split off
 * later by `normalizeTokens`). Punctuation becomes its own token; other symbols (stray
 * quotes, spaces) are dropped. Unreadable morphemes get `r: ""` and are listed in `unknown`
 * so the caller can fill them in with `fillReadings`.
 */
export function tokensFromMorphemes(morphemes: readonly Morpheme[]): Analysis {
  const tokens: RawToken[] = [];
  const unknown: string[] = [];
  let prev: Morpheme | undefined;
  for (let i = 0; i < morphemes.length; i++) {
    let m = morphemes[i] as Morpheme;
    // IPAdic splits 一人/二人 into number + counter (いち|にん); they're jukujikun.
    const next = morphemes[i + 1];
    const joined = next?.surface === "人" && next.pos === "名詞" ? JUKUJIKUN_PAIRS[m.surface] : undefined;
    if (joined) {
      m = { surface: `${m.surface}人`, reading: joined, pos: "名詞", detail: "一般" };
      i++;
    }
    if (m.pos === "記号" || [...m.surface].every((ch) => isPunct(normalizePunct(ch)) || /\s/u.test(ch))) {
      for (const ch of m.surface) {
        const p = normalizePunct(ch);
        if (isPunct(p)) tokens.push({ groups: [{ t: p, r: p }] });
      }
      prev = undefined;
      continue;
    }
    let group = groupFor(m);
    if (!group) {
      unknown.push(m.surface);
      group = { t: m.surface, r: "" };
    }
    const last = tokens[tokens.length - 1];
    if (last && attaches(m, prev)) last.groups.push(group);
    else tokens.push({ groups: [group] });
    prev = m;
  }
  return { tokens, unknown };
}

/** Fill `r: ""` groups from `readings` (surface → hiragana); groups still unread are left empty. */
export function fillReadings(tokens: RawToken[], readings: ReadonlyMap<string, string>): void {
  for (const t of tokens)
    for (const g of t.groups) {
      if (g.r) continue;
      const r = readings.get(g.t);
      if (r && allKana(r)) g.r = toHiragana(r);
    }
}

let tokenizer: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

function load(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  tokenizer ??= new Promise((resolve, reject) => {
    const dicPath = join(dirname(Bun.resolveSync("kuromoji/package.json", import.meta.dir)), "dict");
    kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t)));
  });
  return tokenizer;
}

/** Segment `text` and read it (the IPAdic dictionary loads once, ~200 ms). */
export async function analyze(text: string): Promise<Analysis> {
  const t = await load();
  return tokensFromMorphemes(
    t.tokenize(text).map((k) => ({
      surface: k.surface_form,
      reading: k.reading,
      pos: k.pos,
      detail: k.pos_detail_1,
    })),
  );
}
