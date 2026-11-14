// UTAU voicebank configuration (oto.ini) parsing and alias lookup. Pure; shared by the
// server (which scans data/voice/) and the singer (which picks a sample per syllable).
//
// oto.ini line: `file.wav=alias,offset,consonant,cutoff,preutterance,overlap` (ms).
// cutoff < 0 is the length measured from offset; > 0 is measured back from the file end.

import { toHiragana } from "./kana.ts";
import type { Syllable } from "./voice.ts";

export interface OtoEntry {
  /** Sample path relative to the voicebank root (forward slashes). */
  file: string;
  alias: string;
  offset: number;
  consonant: number;
  cutoff: number;
  preutter: number;
  overlap: number;
}

export interface Voicebank {
  name: string;
  entries: OtoEntry[];
}

/** Parses one oto.ini. `dir` is its folder relative to the bank root ("" for the root). */
export function parseOto(text: string, dir = ""): OtoEntry[] {
  const out: OtoEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const eq = raw.indexOf("=");
    if (eq <= 0) continue;
    const file = raw.slice(0, eq).trim();
    const [alias = "", ...nums] = raw.slice(eq + 1).split(",");
    const [offset, consonant, cutoff, preutter, overlap] = nums.map((n) => Number(n.trim()) || 0);
    if (!/\.wav$/i.test(file)) continue;
    out.push({
      file: dir ? `${dir}/${file}` : file,
      // an empty alias means "the file name without .wav"
      alias: alias.trim() || file.replace(/\.wav$/i, ""),
      offset: offset ?? 0,
      consonant: consonant ?? 0,
      cutoff: cutoff ?? 0,
      preutter: preutter ?? 0,
      overlap: overlap ?? 0,
    });
  }
  return out;
}

/** Reads `name=` from character.txt. */
export function characterName(text: string): string | null {
  const m = /^name\s*=\s*(.+)$/m.exec(text);
  return m?.[1]?.trim() || null;
}

/**
 * Alias without a pitch/expression suffix ("- かA4" → "- か", "a かS" → "a か").
 * Only kana aliases are stripped; romaji ones ("ka") are left alone.
 */
export function baseAlias(alias: string): string {
  return /[\u3041-\u30ff]/.test(alias) ? alias.replace(/(?<=[\u3041-\u30ff])[A-Za-z0-9#_']+$/, "") : alias;
}

const VOWEL_KANA = { a: "あ", i: "い", u: "う", e: "え", o: "お", n: "ん" } as const;

/** Index of a bank's entries for fast syllable lookup. */
export class OtoIndex {
  private readonly byAlias = new Map<string, OtoEntry>();
  /** Last space-separated part of VCV/CVVC aliases ("a か" → "か"), first one wins. */
  private readonly byTail = new Map<string, OtoEntry>();

  constructor(entries: readonly OtoEntry[]) {
    // plain aliases first; suffixed ones (other pitches/expressions) only fill gaps
    const plain = entries.filter((e) => baseAlias(e.alias) === e.alias);
    const suffixed = entries.filter((e) => baseAlias(e.alias) !== e.alias);
    for (const group of [plain, suffixed]) {
      const tails = new Map<string, OtoEntry>();
      for (const e of group) {
        const a = baseAlias(e.alias.normalize("NFC"));
        if (!this.byAlias.has(a)) this.byAlias.set(a, e);
        const tail = a.split(/\s+/).pop() ?? a;
        // prefer phrase-initial "- か" over VCV "a か": its consonant isn't blended
        if (!tails.has(tail) || a.startsWith("-")) tails.set(tail, e);
      }
      for (const [t, e] of tails) if (!this.byTail.has(t)) this.byTail.set(t, e);
    }
  }

  get size(): number {
    return this.byAlias.size;
  }

  /** Best sample for a sung syllable, or null (っ, unknown kana). */
  find(s: Syllable): OtoEntry | null {
    if (s.vowel === null) return null;
    const kana =
      s.kana === "ー" || s.kana === "〜" ? VOWEL_KANA[s.vowel] : s.vowel === "n" ? "ん" : toHiragana(s.kana);
    const romaji = s.vowel === "n" ? "n" : s.consonant + s.vowel;
    for (const k of [kana, `- ${kana}`, romaji, `- ${romaji}`]) {
      const e = this.byAlias.get(k);
      if (e) return e;
    }
    return this.byTail.get(kana) ?? this.byTail.get(romaji) ?? null;
  }
}
