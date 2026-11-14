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
  /** Recorded pitch ("A4") from the alias suffix or folder name; absent = the bank's main pitch. */
  pitch?: string;
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

/** What follows the kana in an alias ("- かA4" → "A4", "a かSA4" → "SA4", "- か" → ""). */
export function aliasSuffix(alias: string): string {
  return alias.slice(baseAlias(alias).length);
}

const NOTE = /^([A-G])(#?)(-?\d)$/;
const NOTE_INDEX: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** Frequency of a note name like "A4" or "C#5", or null if it isn't one. */
export function noteHz(name: string): number | null {
  const m = NOTE.exec(name);
  if (!m) return null;
  const semis = (NOTE_INDEX[m[1] as string] as number) + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
}

/**
 * Pitch tag for an entry: a pure pitch suffix ("A4"), else a note name ending the
 * folder name ("_Core_A4"). Returns null for the main set, and "expression" when the
 * suffix marks another voice quality (Strong "S", Whisper "W"…) that shouldn't sing.
 */
export function pitchTag(alias: string, dir: string): string | null | "expression" {
  const suffix = aliasSuffix(alias);
  if (suffix && noteHz(suffix)) return suffix;
  if (suffix) return "expression";
  const folder = /([A-G]#?\d)$/.exec(dir.split("/").pop() ?? "");
  return folder ? (folder[1] as string) : null;
}

const VOWEL_KANA = { a: "あ", i: "い", u: "う", e: "え", o: "お", n: "ん" } as const;

interface PitchSet {
  hz: number | null;
  byAlias: Map<string, OtoEntry>;
  /** Last space-separated part of VCV/CVVC aliases ("a か" → "か"). */
  byTail: Map<string, OtoEntry>;
}

/** Index of a bank's entries for fast syllable lookup, per recorded pitch. */
export class OtoIndex {
  private readonly sets = new Map<string, PitchSet>();

  constructor(entries: readonly OtoEntry[]) {
    // within a set, plain aliases win over suffixed ones (other expressions) for the same kana
    const plainFirst = [...entries].sort(
      (x, y) => Number(baseAlias(x.alias) !== x.alias) - Number(baseAlias(y.alias) !== y.alias),
    );
    for (const e of plainFirst) {
      const tag = e.pitch ?? "";
      let set = this.sets.get(tag);
      if (!set) {
        set = { hz: tag ? noteHz(tag) : null, byAlias: new Map(), byTail: new Map() };
        this.sets.set(tag, set);
      }
      const a = baseAlias(e.alias.normalize("NFC"));
      if (!set.byAlias.has(a)) set.byAlias.set(a, e);
      const tail = a.split(/\s+/).pop() ?? a;
      // prefer phrase-initial "- か" over VCV "a か": its consonant isn't blended
      if (!set.byTail.has(tail) || a.startsWith("-")) set.byTail.set(tail, e);
    }
  }

  get size(): number {
    let n = 0;
    for (const s of this.sets.values()) n += s.byAlias.size;
    return n;
  }

  /** Recorded pitches available (Hz; null = the untagged main set). */
  get pitches(): Array<number | null> {
    return [...this.sets.values()].map((s) => s.hz);
  }

  /**
   * Best sample for a sung syllable, or null (っ, unknown kana). With `targetHz`, the
   * set recorded closest to it wins (`mainHz` is the untagged set's pitch, if known).
   */
  find(s: Syllable, targetHz?: number, mainHz?: number | null): OtoEntry | null {
    if (s.vowel === null) return null;
    const kana =
      s.hold || s.kana === "ー" || s.kana === "〜"
        ? VOWEL_KANA[s.vowel]
        : s.vowel === "n"
          ? "ん"
          : toHiragana(s.kana);
    const romaji = s.vowel === "n" ? "n" : s.consonant + s.vowel;
    let best: OtoEntry | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const set of this.sets.values()) {
      // glides and holds prefer the recorded transition from the previous vowel ("a い",
      // "u う"): it starts voiced, where "- う" starts with a breath
      const vcv = s.hold ? `${s.vowel} ${kana}` : s.from ? `${s.from} ${kana}` : null;
      const e = (vcv && set.byAlias.get(vcv)) || OtoIndex.lookup(set, kana, romaji);
      if (!e) continue;
      const hz = set.hz ?? mainHz ?? null;
      // unknown pitch: usable, but any set with a known pitch near the target wins
      const dist = targetHz && hz ? Math.abs(Math.log2(hz / targetHz)) : targetHz ? 0.75 : set.hz ? 1 : 0;
      if (dist < bestDist) {
        best = e;
        bestDist = dist;
      }
    }
    return best;
  }

  private static lookup(set: PitchSet, kana: string, romaji: string): OtoEntry | null {
    for (const k of [kana, `- ${kana}`, romaji, `- ${romaji}`]) {
      const e = set.byAlias.get(k);
      if (e) return e;
    }
    return set.byTail.get(kana) ?? set.byTail.get(romaji) ?? null;
  }
}
