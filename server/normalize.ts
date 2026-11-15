// Turn raw LLM output into clean, typeable tokens and validate readings.

import { allKana, isKana, isPunct, normalizePunct, toHiragana } from "../src/lib/core/kana.ts";
import type { DictEntry, RubyGroup, Token } from "../src/lib/core/types.ts";

export interface RawGroup {
  t: string;
  r: string;
}
export interface RawToken {
  groups: RawGroup[];
}

/** A proper noun from the LLM, since the dictionary (Jitendex) has no names. */
export interface ProperName {
  w: string;
  en: string;
}

/** Dictionary entry for a name token the dictionary doesn't know (健太 → "Kenta (male given name)"). */
export function nameEntry(surface: string, reading: string, names: readonly ProperName[]): DictEntry | null {
  const n = names.find((x) => x.w.trim() === surface && x.en.trim());
  if (!n) return null;
  return {
    term: surface,
    reading,
    pitch: null,
    tags: ["name"],
    defs: [n.en.trim()],
    example: null,
    deinflectedFrom: null,
  };
}

export interface ReadingChecker {
  readingsFor(surface: string): Set<string> | null;
}

const WS = /\s+/gu;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split a group like {t:"食べ物", r:"たべもの"} into per-run groups
 * [{t:"食",r:"た"},{t:"べ",r:"べ"},{t:"物",r:"もの"}] by aligning the kana runs of t
 * against r. Returns the group unchanged if alignment fails.
 */
export function splitOkurigana(g: RubyGroup): RubyGroup[] {
  const runs: Array<{ kana: boolean; s: string }> = [];
  for (const ch of g.t) {
    const k = isKana(ch);
    const last = runs[runs.length - 1];
    if (last && last.kana === k) last.s += ch;
    else runs.push({ kana: k, s: ch });
  }
  if (runs.length <= 1) return [g];
  const re = new RegExp(
    `^${runs.map((r) => (r.kana ? `(${escapeRe(toHiragana(r.s))})` : "(.+?)")).join("")}$`,
    "u",
  );
  const m = re.exec(toHiragana(g.r));
  if (!m) return [g];
  return runs.map((run, i) => ({ t: run.s, r: run.kana ? run.s : (m[i + 1] as string) }));
}

export interface NormalizeResult {
  tokens: Token[];
  /** Human-readable problems; non-empty means the passage is suspect. */
  problems: string[];
  kana: number;
}

export function normalizeTokens(raw: RawToken[], checker: ReadingChecker | null): NormalizeResult {
  const tokens: Token[] = [];
  const problems: string[] = [];
  let kana = 0;

  const pushPunct = (ch: string) => {
    tokens.push({ groups: [{ t: ch, r: ch }] });
    kana += 1;
  };

  for (const rt of raw) {
    const groups: RubyGroup[] = [];
    let bad = false;
    for (const rg of rt.groups ?? []) {
      const t = [...(rg.t ?? "").replace(WS, "")].map(normalizePunct).join("");
      if (!t) continue;
      // Punctuation-only groups become their own tokens (flush what we have first).
      if ([...t].every(isPunct)) {
        if (groups.length) tokens.push({ groups: groups.splice(0) });
        for (const ch of t) pushPunct(ch);
        continue;
      }
      // Kana-only: the text is the reading.
      if (allKana(t)) {
        groups.push({ t, r: t });
        continue;
      }
      // Trailing punctuation glued onto a word, e.g. "猫。"
      let core = t;
      const trailing: string[] = [];
      while (core.length > 1 && isPunct(core.slice(-1))) {
        trailing.unshift(core.slice(-1));
        core = core.slice(0, -1);
      }
      const r = toHiragana((rg.r ?? "").replace(WS, ""));
      if (!r || ![...r].every(isKana)) {
        problems.push(`bad reading for ${core}: "${rg.r}"`);
        bad = true;
        break;
      }
      groups.push(...splitOkurigana({ t: core, r }));
      if (trailing.length) {
        tokens.push({ groups: groups.splice(0) });
        for (const ch of trailing) pushPunct(ch);
      }
    }
    if (bad) continue;
    if (groups.length === 0) continue;
    const surface = groups.map((g) => g.t).join("");
    const reading = toHiragana(groups.map((g) => g.r).join(""));
    if (checker && !allKana(surface)) {
      const known = checker.readingsFor(surface);
      if (known && known.size > 0 && !known.has(reading)) {
        problems.push(`${surface}: ${reading} not in [${[...known].join(", ")}]`);
      }
    }
    for (const g of groups) kana += g.r.length;
    tokens.push({ groups });
  }
  return { tokens, problems, kana };
}

/** Trim a passage to roughly `target` kana, cutting at a sentence end. */
const OPENERS = new Set(["「", "『", "（"]);
const CLOSERS = new Set(["」", "』", "）"]);
const QUOTATIVE = /^(と|って)/;

/**
 * Cuts the passage at a sentence end near `target` kana. A sentence end inside a quote
 * only counts once the quote closes, and the closing brackets after 。 stay with it
 * (「…。」 never loses its 」).
 */
export function trimToLength(tokens: Token[], target: number): Token[] {
  const ends = new Set(sentenceEnds(tokens));
  let kana = 0;
  let lastEnd = -1;
  for (let i = 0; i < tokens.length; i++) {
    for (const g of (tokens[i] as Token).groups) kana += g.r.length;
    if (ends.has(i)) {
      if (kana >= target * 0.8) return tokens.slice(0, i + 1);
      lastEnd = i;
    }
    if (kana > target * 1.5 && lastEnd >= 0) return tokens.slice(0, lastEnd + 1);
  }
  return tokens;
}

/**
 * Indices of the tokens that end a top-level sentence: 。！？ outside quotes, or the
 * last closing bracket right after one (「…。」 ends at 」).
 */
export function sentenceEnds(tokens: readonly Token[]): number[] {
  const out: number[] = [];
  let depth = 0;
  let endPending = false; // just saw 。！？ — closers that follow still belong to it
  const text = (t: Token | undefined) => t?.groups.map((g) => g.t).join("") ?? "";
  for (let i = 0; i < tokens.length; i++) {
    const t = text(tokens[i]);
    if (OPENERS.has(t)) depth++;
    if (CLOSERS.has(t)) depth = Math.max(0, depth - 1);
    const isEnd = t === "。" || t === "！" || t === "？";
    if (isEnd || (endPending && CLOSERS.has(t))) {
      endPending = true;
      const next = text(tokens[i + 1]);
      // 「…。」と言った continues the sentence through the quotative と/って
      if (depth === 0 && !CLOSERS.has(next) && !(CLOSERS.has(t) && QUOTATIVE.test(next))) out.push(i);
    } else endPending = false;
  }
  return out;
}

/**
 * English for the sentences that survived trimming. `perSentence` is the model's
 * one-translation-per-sentence list for the untrimmed passage. Models often translate
 * each sentence inside a quote separately (「…。…。」 → two), so when the top-level count
 * doesn't match, the count of every 。！？ is tried too (trims always end on a top-level
 * end, which is also one of those). Otherwise only an untrimmed passage keeps it (all of
 * it) — a translation with sentences that aren't in the text is worse than none.
 */
export function translationFor(
  perSentence: readonly string[],
  all: readonly Token[],
  kept: readonly Token[],
): string {
  const clean = perSentence.map((s) => s.trim()).filter(Boolean);
  if (kept.length === all.length) return clean.join(" ");
  for (const count of [(ts: readonly Token[]) => sentenceEnds(ts).length, innerSentenceCount])
    if (clean.length === count(all)) return clean.slice(0, count(kept)).join(" ");
  return "";
}

/** Sentence ends at any depth: each run of 。！？ (so 「…よ。…た。」 is two). */
function innerSentenceCount(tokens: readonly Token[]): number {
  const isEnd = (t: Token | undefined) => {
    const s = t?.groups.map((g) => g.t).join("");
    return s === "。" || s === "！" || s === "？";
  };
  let n = 0;
  for (let i = 0; i < tokens.length; i++) if (isEnd(tokens[i]) && !isEnd(tokens[i + 1])) n++;
  return n;
}

export function countKana(tokens: Token[]): number {
  let n = 0;
  for (const t of tokens) for (const g of t.groups) n += g.r.length;
  return n;
}
