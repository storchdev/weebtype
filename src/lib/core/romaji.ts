// Romaji input engine.
//
// The target text is a kana string. It is split into *units* (a single kana, a
// yōon pair like きゃ, っ, ん, or a punctuation mark), each with a list of accepted
// romaji spellings. Keys are matched against the live candidates of the current
// unit; a wrong key is rejected. Two units are context dependent:
//   ん  accepts "nn" / "n'" / "xn", and a single "n" when the next key is a
//       consonant that starts the next unit (not a vowel, y or n).
//   っ  accepts "xtu"/"ltu"/"xtsu"/"ltsu", or doubling the next unit's consonant.

import { PUNCT_KEYS, toHiragana } from "./kana.ts";

const MONO: Readonly<Record<string, readonly string[]>> = {
  あ: ["a"],
  い: ["i", "yi"],
  う: ["u", "wu", "whu"],
  え: ["e"],
  お: ["o"],
  か: ["ka", "ca"],
  き: ["ki"],
  く: ["ku", "cu", "qu"],
  け: ["ke"],
  こ: ["ko", "co"],
  が: ["ga"],
  ぎ: ["gi"],
  ぐ: ["gu"],
  げ: ["ge"],
  ご: ["go"],
  さ: ["sa"],
  し: ["shi", "si", "ci"],
  す: ["su"],
  せ: ["se", "ce"],
  そ: ["so"],
  ざ: ["za"],
  じ: ["ji", "zi"],
  ず: ["zu"],
  ぜ: ["ze"],
  ぞ: ["zo"],
  た: ["ta"],
  ち: ["chi", "ti"],
  つ: ["tsu", "tu"],
  て: ["te"],
  と: ["to"],
  だ: ["da"],
  ぢ: ["di", "ji", "zi"],
  づ: ["du", "zu"],
  で: ["de"],
  ど: ["do"],
  な: ["na"],
  に: ["ni"],
  ぬ: ["nu"],
  ね: ["ne"],
  の: ["no"],
  は: ["ha"],
  ひ: ["hi"],
  ふ: ["fu", "hu"],
  へ: ["he"],
  ほ: ["ho"],
  ば: ["ba"],
  び: ["bi"],
  ぶ: ["bu"],
  べ: ["be"],
  ぼ: ["bo"],
  ぱ: ["pa"],
  ぴ: ["pi"],
  ぷ: ["pu"],
  ぺ: ["pe"],
  ぽ: ["po"],
  ま: ["ma"],
  み: ["mi"],
  む: ["mu"],
  め: ["me"],
  も: ["mo"],
  や: ["ya"],
  ゆ: ["yu"],
  よ: ["yo"],
  ら: ["ra"],
  り: ["ri"],
  る: ["ru"],
  れ: ["re"],
  ろ: ["ro"],
  わ: ["wa"],
  ゐ: ["wyi"],
  ゑ: ["wye"],
  を: ["wo", "o"],
  ゔ: ["vu"],
  ぁ: ["xa", "la"],
  ぃ: ["xi", "li"],
  ぅ: ["xu", "lu"],
  ぇ: ["xe", "le"],
  ぉ: ["xo", "lo"],
  ゃ: ["xya", "lya"],
  ゅ: ["xyu", "lyu"],
  ょ: ["xyo", "lyo"],
  ゎ: ["xwa", "lwa"],
  ゕ: ["xka", "lka"],
  ゖ: ["xke", "lke"],
};

/** Two-kana units (base + small kana) with their direct spellings. */
// The target is always known, so spellings an IME would read differently (ディ "di",
// ぢゃ "ja", を "o") are accepted too: whatever sounds right should just work.
const YOON: Readonly<Record<string, readonly string[]>> = {
  きゃ: ["kya"],
  きゅ: ["kyu"],
  きょ: ["kyo"],
  きぇ: ["kye"],
  きぃ: ["kyi"],
  ぎゃ: ["gya"],
  ぎゅ: ["gyu"],
  ぎょ: ["gyo"],
  ぎぇ: ["gye"],
  ぎぃ: ["gyi"],
  しゃ: ["sha", "sya"],
  しゅ: ["shu", "syu"],
  しょ: ["sho", "syo"],
  しぇ: ["she", "sye"],
  しぃ: ["syi"],
  じゃ: ["ja", "jya", "zya"],
  じゅ: ["ju", "jyu", "zyu"],
  じょ: ["jo", "jyo", "zyo"],
  じぇ: ["je", "jye", "zye"],
  じぃ: ["jyi", "zyi"],
  ちゃ: ["cha", "tya", "cya"],
  ちゅ: ["chu", "tyu", "cyu"],
  ちょ: ["cho", "tyo", "cyo"],
  ちぇ: ["che", "tye", "cye"],
  ちぃ: ["tyi", "cyi"],
  ぢゃ: ["dya", "ja", "jya", "zya"],
  ぢゅ: ["dyu", "ju", "jyu", "zyu"],
  ぢょ: ["dyo", "jo", "jyo", "zyo"],
  ぢぇ: ["dye", "je", "jye", "zye"],
  ぢぃ: ["dyi"],
  にゃ: ["nya"],
  にゅ: ["nyu"],
  にょ: ["nyo"],
  にぇ: ["nye"],
  にぃ: ["nyi"],
  ひゃ: ["hya"],
  ひゅ: ["hyu"],
  ひょ: ["hyo"],
  ひぇ: ["hye"],
  ひぃ: ["hyi"],
  びゃ: ["bya"],
  びゅ: ["byu"],
  びょ: ["byo"],
  びぇ: ["bye"],
  びぃ: ["byi"],
  ぴゃ: ["pya"],
  ぴゅ: ["pyu"],
  ぴょ: ["pyo"],
  ぴぇ: ["pye"],
  ぴぃ: ["pyi"],
  みゃ: ["mya"],
  みゅ: ["myu"],
  みょ: ["myo"],
  みぇ: ["mye"],
  みぃ: ["myi"],
  りゃ: ["rya"],
  りゅ: ["ryu"],
  りょ: ["ryo"],
  りぇ: ["rye"],
  りぃ: ["ryi"],
  ふぁ: ["fa", "fwa"],
  ふぃ: ["fi", "fyi"],
  ふぇ: ["fe", "fye"],
  ふぉ: ["fo", "fwo"],
  ふゅ: ["fyu"],
  てぃ: ["thi", "ti"],
  てゅ: ["thu", "tyu"],
  でぃ: ["dhi", "di"],
  でゅ: ["dhu", "dyu", "du"],
  とぅ: ["twu", "tu"],
  どぅ: ["dwu", "du"],
  うぃ: ["wi", "whi"],
  うぇ: ["we", "whe"],
  うぉ: ["who", "wo"],
  ゔぁ: ["va"],
  ゔぃ: ["vi"],
  ゔぇ: ["ve"],
  ゔぉ: ["vo"],
  ゔゅ: ["vyu"],
  つぁ: ["tsa"],
  つぃ: ["tsi"],
  つぇ: ["tse"],
  つぉ: ["tso"],
  くぁ: ["kwa", "qa"],
  ぐぁ: ["gwa"],
  くぃ: ["kwi"],
  くぇ: ["kwe"],
  くぉ: ["kwo"],
  ぐぃ: ["gwi"],
  ぐぇ: ["gwe"],
  ぐぉ: ["gwo"],
  いぇ: ["ye"],
  すぃ: ["si", "swi"],
  ずぃ: ["zi", "zwi"],
};

const SMALL = new Set([..."ぁぃぅぇぉゃゅょゎ"]);
const SOKUON_BASE = ["xtu", "ltu", "xtsu", "ltsu"] as const;
const N_BASE = ["nn", "n'", "xn"] as const;
const VOWELS_Y_N = "aiueoyn";

export type UnitKind = "normal" | "sokuon" | "n";

export interface Unit {
  /** Kana as it appears in the target (katakana preserved). */
  kana: string;
  /** Offset of this unit in the target kana string. */
  start: number;
  kind: UnitKind;
  /** Static candidates (dynamic ones for っ/ん are added at match time). */
  cands: readonly string[];
}

function product(a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = [];
  for (const x of a) for (const y of b) out.push(x + y);
  return out;
}

function monoCands(ch: string): readonly string[] {
  const m = MONO[ch] ?? PUNCT_KEYS[ch];
  if (m) return m;
  // Unknown character (digit, latin letter...): type it literally.
  return [ch.normalize("NFKC").toLowerCase()];
}

export function splitUnits(target: string): Unit[] {
  const units: Unit[] = [];
  const chars = [...target];
  const hira = chars.map(toHiragana);
  let offset = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] as string;
    const h = hira[i] as string;
    const next = hira[i + 1];
    if (h === "っ") {
      units.push({ kana: c, start: offset, kind: "sokuon", cands: SOKUON_BASE });
    } else if (h === "ん") {
      units.push({ kana: c, start: offset, kind: "n", cands: N_BASE });
    } else if (next !== undefined && SMALL.has(next) && YOON[h + next]) {
      const direct = YOON[h + next] as readonly string[];
      const cands = [...direct, ...product(monoCands(h), monoCands(next))];
      units.push({ kana: c + (chars[i + 1] as string), start: offset, kind: "normal", cands });
      offset += c.length;
      i++;
      offset += (chars[i] as string).length;
      continue;
    } else {
      units.push({ kana: c, start: offset, kind: "normal", cands: monoCands(h) });
    }
    offset += c.length;
  }
  return units;
}

export type KeyResult =
  | { ok: false }
  | {
      ok: true;
      /** Number of units completed by this key (0, 1, or 2 for a single-n ん). */
      completed: number;
    };

export class RomajiEngine {
  readonly units: Unit[];
  readonly length: number;
  private idx = 0;
  private buf = "";
  /** What was actually typed for each completed unit. */
  private typedUnits: string[] = [];

  constructor(target: string) {
    this.units = splitUnits(target);
    this.length = target.length;
  }

  get unitIndex(): number {
    return this.idx;
  }
  get buffer(): string {
    return this.buf;
  }
  get done(): boolean {
    return this.idx >= this.units.length;
  }
  /** Kana offset up to which the target is fully typed. */
  get kanaDone(): number {
    return this.units[this.idx]?.start ?? this.length;
  }

  candidates(i: number): string[] {
    const u = this.units[i];
    if (!u) return [];
    if (u.kind === "sokuon") {
      const out = [...u.cands];
      const next = this.units[i + 1];
      if (next && next.kind !== "sokuon") {
        for (const c of this.candidates(i + 1)) {
          const first = c[0];
          if (first && /[a-z]/.test(first) && !VOWELS_Y_N.includes(first) && !out.includes(first)) {
            out.push(first);
          }
          if (c.startsWith("ch") && !out.includes("t")) out.push("t");
        }
      }
      return out;
    }
    return [...u.cands];
  }

  press(rawKey: string): KeyResult {
    if (this.done || rawKey.length !== 1) return { ok: false };
    const k = /[A-Z]/.test(rawKey) ? rawKey.toLowerCase() : rawKey;
    const u = this.units[this.idx] as Unit;
    const nb = this.buf + k;
    const live = this.candidates(this.idx).filter((c) => c.startsWith(nb));
    if (live.length > 0) {
      if (live.includes(nb)) {
        this.buf = nb;
        this.advance();
        return { ok: true, completed: 1 };
      }
      this.buf = nb;
      return { ok: true, completed: 0 };
    }
    // Single "n" for ん followed by a consonant that starts the next unit.
    if (u.kind === "n" && this.buf === "n" && !VOWELS_Y_N.includes(k) && this.idx + 1 < this.units.length) {
      if (this.candidates(this.idx + 1).some((c) => c.startsWith(k))) {
        this.advance();
        const r = this.press(k);
        return r.ok ? { ok: true, completed: 1 + r.completed } : { ok: true, completed: 1 };
      }
    }
    return { ok: false };
  }

  private advance(): void {
    this.typedUnits[this.idx] = this.buf;
    this.idx++;
    this.buf = "";
  }

  /** Preferred spelling for unit i (respecting the current buffer if i is current). */
  preferred(i: number): string {
    const u = this.units[i];
    if (!u) return "";
    const cands = this.candidates(i);
    if (i === this.idx && this.buf) {
      const hit = cands.find((c) => c.startsWith(this.buf));
      if (hit) return hit;
    }
    if (u.kind === "sokuon") {
      const nextPref = this.units[i + 1] ? this.preferred(i + 1) : "";
      if (nextPref.startsWith("ch")) return "c";
      const first = nextPref[0];
      return first && /[a-z]/.test(first) && !VOWELS_Y_N.includes(first) ? first : "xtu";
    }
    if (u.kind === "n") {
      const nextPref = this.units[i + 1] ? this.preferred(i + 1) : "";
      const first = nextPref[0];
      return !first || VOWELS_Y_N.includes(first) ? "nn" : "n";
    }
    return cands[0] ?? "";
  }

  /**
   * Romaji guide for the kana range [from, to): `typed` is what has already been
   * entered (completed units + buffer), `rest` is what remains.
   */
  guide(from: number, to: number): { typed: string; rest: string } {
    let typed = "";
    let rest = "";
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i] as Unit;
      if (u.start < from || u.start >= to) continue;
      const p = this.preferred(i);
      if (i < this.idx) typed += this.typedUnits[i] ?? p;
      else if (i === this.idx) {
        typed += this.buf;
        rest += p.slice(this.buf.length);
      } else rest += p;
    }
    return { typed, rest };
  }
}
