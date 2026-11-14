// Pure helpers for the singer's synthesized voice: kana → syllables (onset class +
// vowel) and a small pentatonic melody that wanders as you type. The Web Audio
// side lives in src/lib/singer.ts.

import { isPunct } from "./kana.ts";
import { splitUnits } from "./romaji.ts";

export type Vowel = "a" | "i" | "u" | "e" | "o";

/** Rough articulation class of a syllable's consonant; drives the noise burst and formant glide. */
export type Onset =
  | "none"
  | "plosive" // k t p
  | "voiced" // g d b
  | "fricative" // s sh h f
  | "buzz" // z j v
  | "affricate" // ch ts
  | "nasal" // m n
  | "liquid" // r
  | "glideY" // y (and palatalised kya, sha…)
  | "glideW"; // w

export interface Syllable {
  kana: string;
  onset: Onset;
  /** Consonant letters, e.g. "sh", "k" — used to pick the noise colour. */
  consonant: string;
  /** "n" = syllabic ん (hummed), null = silent beat (っ). */
  vowel: Vowel | "n" | null;
}

const VOWELS = "aiueo";

function onsetOf(c: string): Onset {
  if (c === "") return "none";
  if (c === "ch" || c === "ts") return "affricate";
  if (c === "sh" || c === "s" || c === "h" || c === "f") return "fricative";
  const first = c[0] as string;
  // palatalised (ky, ny, ry…) behave like their first consonant
  if ("ktp".includes(first)) return "plosive";
  if ("gdb".includes(first)) return "voiced";
  if ("zjv".includes(first)) return "buzz";
  if ("mn".includes(first)) return "nasal";
  if (first === "r") return "liquid";
  if (first === "y") return "glideY";
  if (first === "w") return "glideW";
  if ("sh".includes(first)) return "fricative";
  if (first === "c" || first === "q") return "plosive";
  return "none";
}

/**
 * Splits newly typed kana into sung syllables. `prev` is the last sung vowel, so a
 * long-vowel mark (ー) continues it. Punctuation and unknown characters are skipped.
 */
export function syllables(text: string, prev: Vowel | null = null): Syllable[] {
  const out: Syllable[] = [];
  let last = prev;
  for (const u of splitUnits(text)) {
    if (u.kana === "ー" || u.kana === "〜") {
      if (last) out.push({ kana: u.kana, onset: "none", consonant: "", vowel: last });
      continue;
    }
    if (isPunct(u.kana)) continue;
    if (u.kind === "sokuon") {
      out.push({ kana: u.kana, onset: "none", consonant: "", vowel: null });
      continue;
    }
    if (u.kind === "n") {
      out.push({ kana: u.kana, onset: "nasal", consonant: "n", vowel: "n" });
      continue;
    }
    const r = u.cands[0] ?? "";
    const v = r[r.length - 1] ?? "";
    if (!VOWELS.includes(v) || r.length === 0) continue; // digits, latin…
    const consonant = r.slice(0, -1);
    out.push({ kana: u.kana, onset: onsetOf(consonant), consonant, vowel: v as Vowel });
    last = v as Vowel;
  }
  return out;
}

/** Major pentatonic, in semitones above the base note, across two octaves. */
export const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21] as const;

/**
 * A random walk over the pentatonic scale: mostly steps, sometimes leaps, pulled
 * back toward the middle, and settling on the tonic at the end of a phrase.
 */
export class Melody {
  private degree = 2;
  private readonly rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  /** Next note in semitones above the base. */
  next(): number {
    const r = this.rng();
    const step = r < 0.12 ? 0 : r < 0.78 ? 1 : 2;
    const mid = (SCALE.length - 1) / 2;
    // bias the direction toward the middle of the range
    const upChance = 0.5 + (mid - this.degree) * 0.08;
    const dir = this.rng() < upChance ? 1 : -1;
    this.degree = Math.max(0, Math.min(SCALE.length - 1, this.degree + dir * step));
    return SCALE[this.degree] as number;
  }

  /** End of a phrase (、。!?): land on a tonic for the next note. */
  cadence(): void {
    this.degree = this.degree >= 5 ? 5 : 0;
  }

  reset(): void {
    this.degree = 2;
  }
}
