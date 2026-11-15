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
  /** IPAdic part of speech and first two details (名詞 / 接尾 / 助数詞). */
  pos: string;
  detail: string;
  detail2?: string;
}

/** Whole-word readings of a written form, with a popularity score (Jitendex via `Dictionary`). */
export type WordReadings = (surface: string) => readonly { r: string; s: number }[];

export interface Analysis {
  tokens: RawToken[];
  /** Surfaces with kanji (or other non-kana) the analyzer has no reading for, in order. */
  unknown: string[];
}

/** Irregular counts, used when there is no dictionary to look them up in. */
const IRREGULAR_COUNTS: Readonly<Record<string, string>> = { 一人: "ひとり", 二人: "ふたり" };

const isNumber = (m: Morpheme) => m.pos === "名詞" && m.detail === "数";
const isCounter = (m: Morpheme) => m.pos === "名詞" && m.detail === "接尾" && m.detail2 === "助数詞";

/**
 * Can `m` extend a compound that `prev` is part of? IPAdic splits number + counter
 * (一|人, 二|十|歳) and noun + suffix (午前|中, 具体|的), reading each piece on its own.
 */
function continues(m: Morpheme, prev: Morpheme): boolean {
  if (m.pos !== "名詞" || allKana(m.surface)) return false;
  if (isNumber(m)) return isNumber(prev);
  return m.detail === "接尾" || m.surface === "中";
}

const startsCompound = (m: Morpheme) => m.pos === "名詞" && m.detail !== "非自立" && !allKana(m.surface);

const GEMINATE: ReadonlyArray<[RegExp, RegExp]> = [
  [/(いち|はち|じゅう)$/u, /^[かきくけこさしすせそたちつてとはひふへほ]/u],
  [/ろく$/u, /^[かきくけこはひふへほ]/u],
];
const HANDAKUTEN: Readonly<Record<string, string>> = { は: "ぱ", ひ: "ぴ", ふ: "ぷ", へ: "ぺ", ほ: "ぽ" };
/** After ん these voice: 三百 さんびゃく, 三千 さんぜん, 三本 さんぼん, 三分 さんぷん, 三泊 さんぱく. */
const AFTER_N: ReadonlyArray<[string, string]> = [
  ["ひゃく", "びゃく"],
  ["せん", "ぜん"],
  ["ほん", "ぼん"],
  ["ひき", "びき"],
  ["はい", "ばい"],
  ["ふん", "ぷん"],
  ["はく", "ぱく"],
  ["はつ", "ぱつ"],
];

/**
 * Join the readings of a number's pieces and its counter with the regular sound changes
 * (一本 いっぽん, 八百 はっぴゃく, 十回 じゅっかい, 三匹 さんびき). Irregular counts (一人, 二十日)
 * come from the dictionary instead.
 */
export function joinCountReadings(parts: readonly string[]): string {
  let out = "";
  for (const raw of parts) {
    let next = raw;
    const gem = GEMINATE.find(([end, start]) => end.test(out) && start.test(next));
    if (gem) {
      out = out.replace(gem[0], (m) => `${m.slice(0, -1)}っ`);
      const h = HANDAKUTEN[next[0] ?? ""];
      if (h) next = h + next.slice(1);
    } else if (out.endsWith("ん")) {
      const v = AFTER_N.find(([from]) => next.startsWith(from));
      if (v) next = v[1] + next.slice(v[0].length);
    }
    out += next;
  }
  return out;
}

const hira = (m: Morpheme) =>
  m.reading && m.reading !== "*" && allKana(m.reading) ? toHiragana(m.reading) : null;

/**
 * Pick a reading for the compound `ms` from the dictionary: the most common one, ties going to
 * the analyzer's own (`piece`). 分 read as minutes keeps minute readings (十分 isn't じゅうぶん
 * when IPAdic split it as a count); 一日 after 〜月 is the date ついたち.
 */
function pickReading(
  ms: readonly Morpheme[],
  prev: Morpheme | undefined,
  piece: string,
  words: WordReadings,
): string | null {
  const surface = ms.map((m) => m.surface).join("");
  let cands = words(surface).filter((c) => c.r && allKana(c.r));
  const last = ms[ms.length - 1] as Morpheme;
  if (last.surface === "分" && last.reading === "フン") cands = cands.filter((c) => /[ふぷ]ん$/u.test(c.r));
  if (cands.length === 0) return null;
  if (surface === "一日" && prev?.surface.endsWith("月") && cands.some((c) => c.r === "ついたち"))
    return "ついたち";
  const top = Math.max(...cands.map((c) => c.s));
  const best = cands.filter((c) => c.s === top);
  return (best.find((c) => c.r === piece) ?? best[0])?.r ?? null;
}

/**
 * The compound starting at `ms[i]`, if any: the longest run the dictionary knows (一日中,
 * 二階建て, 午前中), else a number with its counter joined by sound rules (三百円, 二十分).
 * Returns the merged morpheme and how many morphemes it covers.
 */
function compoundAt(
  ms: readonly Morpheme[],
  i: number,
  words: WordReadings | undefined,
): { m: Morpheme; n: number } | null {
  const first = ms[i] as Morpheme;
  if (!startsCompound(first) || hira(first) === null) return null;
  let end = i;
  while (
    end + 1 < ms.length &&
    continues(ms[end + 1] as Morpheme, ms[end] as Morpheme) &&
    hira(ms[end + 1] as Morpheme) !== null
  )
    end++;
  if (end === i) return null;
  // A count is the number run plus one counter; dictionary spans may not stop inside it.
  let count = i;
  if (isNumber(first)) {
    while (count + 1 <= end && isNumber(ms[count + 1] as Morpheme)) count++;
    if (count + 1 <= end && isCounter(ms[count + 1] as Morpheme)) count++;
  }
  const merged = (n: number, reading: string): { m: Morpheme; n: number } => ({
    m: {
      surface: ms
        .slice(i, i + n)
        .map((m) => m.surface)
        .join(""),
      reading,
      pos: "名詞",
      detail: "一般",
    },
    n,
  });
  const readingOf = (j: number) => {
    const span = ms.slice(i, j + 1);
    const countPart = isNumber(first) ? span.slice(0, Math.min(j, count) - i + 1) : [];
    const rest = span.slice(countPart.length);
    return (
      joinCountReadings(countPart.map((m) => hira(m) as string)) + rest.map((m) => hira(m) as string).join("")
    );
  };
  if (words)
    for (let j = end; j > Math.max(i, isNumber(first) ? count - 1 : i); j--) {
      const r = pickReading(ms.slice(i, j + 1), ms[i - 1], readingOf(j), words);
      if (r) return merged(j - i + 1, r);
    }
  if (!isNumber(first) || count === i) return null;
  const surface = ms
    .slice(i, count + 1)
    .map((m) => m.surface)
    .join("");
  return merged(count - i + 1, IRREGULAR_COUNTS[surface] ?? readingOf(count));
}

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
 * so the caller can fill them in with `fillReadings`. With `words`, compounds IPAdic reads piece
 * by piece (一|人 いち|にん) take the dictionary's whole-word reading.
 */
export function tokensFromMorphemes(morphemes: readonly Morpheme[], words?: WordReadings): Analysis {
  const tokens: RawToken[] = [];
  const unknown: string[] = [];
  let prev: Morpheme | undefined;
  for (let i = 0; i < morphemes.length; i++) {
    let m = morphemes[i] as Morpheme;
    const compound = compoundAt(morphemes, i, words);
    if (compound) {
      m = compound.m;
      i += compound.n - 1;
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
export async function analyze(text: string, words?: WordReadings): Promise<Analysis> {
  const t = await load();
  return tokensFromMorphemes(
    t.tokenize(text).map((k) => ({
      surface: k.surface_form,
      reading: k.reading,
      pos: k.pos,
      detail: k.pos_detail_1,
      detail2: k.pos_detail_2,
    })),
    words,
  );
}
