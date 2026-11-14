// Turn raw LLM output into clean, typeable tokens and validate readings.

import { allKana, isKana, isPunct, normalizePunct, toHiragana } from "../src/lib/core/kana.ts";
import type { RubyGroup, Token } from "../src/lib/core/types.ts";

export interface RawGroup {
  t: string;
  r: string;
}
export interface RawToken {
  groups: RawGroup[];
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
export function trimToLength(tokens: Token[], target: number): Token[] {
  let kana = 0;
  let lastEnd = -1;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as Token;
    for (const g of tok.groups) kana += g.r.length;
    const t = tok.groups[0]?.t;
    if (t === "。" || t === "！" || t === "？") {
      if (kana >= target * 0.8) return tokens.slice(0, i + 1);
      lastEnd = i;
    }
    if (kana > target * 1.5 && lastEnd >= 0) return tokens.slice(0, lastEnd + 1);
  }
  return tokens;
}

export function countKana(tokens: Token[]): number {
  let n = 0;
  for (const t of tokens) for (const g of t.groups) n += g.r.length;
  return n;
}
