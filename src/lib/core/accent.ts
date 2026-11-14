// Tokyo pitch-accent contour for a passage, so the battle singer's melody follows the
// real rises and drops of the sentence. Pure; per character of the session target
// (the concatenated readings), returns a pitch in semitones relative to the phrase base.
//
// Model (standard Tokyo Japanese):
// - Each content word starts an accentual phrase: first mora low (unless accent 1), rise
//   on the second, fall after the downstep mora (Kanjium value, adjusted for inflection).
// - Particles/auxiliaries continue the phrase: high after a heiban word, low after a drop.
//   です/ます-type auxiliaries carry their own drop, realised only if nothing dropped yet.
// - Catathesis: each phrase after a drop starts a bit lower; resets at 。！？.
// - Words without data: katakana loans get the usual antepenultimate accent, others heiban.

import { isKatakana, isPunct } from "./kana.ts";
import { getKanaMorae } from "./pitch.ts";
import type { DictEntry, Token } from "./types.ts";

/** Semitones: phrase-initial low, high, and the first low after a drop. */
const INITIAL_LOW = 2;
const HIGH = 5;
const DROPPED_LOW = 0;
/** Each further low mora after a drop sinks a little more, down to this. */
const FLOOR = -2;
/** Register drop per accented phrase (catathesis), and its limit. */
const CATATHESIS = 1;
const MAX_CATATHESIS = 3;

/** Particles and endings that never start a phrase and have no accent of their own. */
const PARTICLES = new Set([
  ..."はがをにでともへやかねよなのさぞわ",
  "から",
  "まで",
  "より",
  "だけ",
  "しか",
  "ほど",
  "など",
  "って",
  "けど",
  "けれど",
  "ので",
  "のに",
  "ても",
  "でも",
  "には",
  "では",
  "とは",
  "へは",
  "にも",
  "でも",
  "とも",
  "かな",
  "かも",
  "よね",
  "だ",
  "だった",
  "ば",
  "ながら",
  "たり",
  "ね",
]);

/** Auxiliaries with their own downstep (mora count from their start). */
const AUXILIARIES: Record<string, number> = {
  です: 1,
  でした: 1,
  でしょう: 2,
  ます: 1,
  ました: 1,
  ません: 2,
  ましょう: 2,
  だろう: 2,
  でしたら: 1,
};

/** Morae that can't carry the accent nucleus; it moves back over them. */
const SPECIAL = new Set(["ん", "っ", "ー", "ン", "ッ"]);

const SENTENCE_END = new Set(["。", "！", "？", "!", "?"]);

interface Word {
  reading: string;
  start: number;
  entry: DictEntry | undefined;
  punct: boolean;
}

function entryKey(t: Token): string | null {
  const e = t.dict?.[0];
  return e ? `${e.term}|${e.reading}|${e.deinflectedFrom ?? ""}` : null;
}

/** Merge tokens that share a dictionary entry (kanji stem + okurigana token). */
function words(tokens: Token[]): Word[] {
  const out: Word[] = [];
  let at = 0;
  let prevKey: string | null = null;
  for (const t of tokens) {
    const reading = t.groups.map((g) => g.r).join("");
    const punct = reading.length > 0 && [...reading].every((c) => isPunct(c) && c !== "ー");
    const key = punct ? null : entryKey(t);
    const last = out[out.length - 1];
    if (key && key === prevKey && last && !last.punct) last.reading += reading;
    else out.push({ reading, start: at, entry: t.dict?.[0], punct });
    prevKey = key;
    at += reading.length;
  }
  return out;
}

/** Move a downstep back off special morae (ん, っ, ー). */
function settle(n: number, morae: string[]): number {
  let k = n;
  while (k > 1 && SPECIAL.has(morae[k - 1] as string)) k--;
  return k;
}

/**
 * Downstep for an (possibly inflected) word: 0 = heiban, n = last high mora (1-based).
 * Exported for tests.
 */
export function downstepFor(reading: string, entry: DictEntry | undefined): number {
  const morae = getKanaMorae(reading);
  const len = morae.length;
  const dict = entry?.pitch ?? null;
  if (dict === null) {
    // Unknown: loanwords usually take the antepenultimate accent, the rest heiban.
    if ([...reading].every((c) => isKatakana(c) || c === "ー") && len >= 3) return settle(len - 2, morae);
    return 0;
  }
  if (!entry || entry.reading === reading || !entry.deinflectedFrom) return Math.min(dict, len);

  // Inflected: the part after what it shares with the dictionary form.
  let p = 0;
  while (p < reading.length && reading[p] === entry.reading[p]) p++;
  const from = getKanaMorae(reading.slice(0, p)).length;
  const idx = (m: string) => {
    for (let i = from; i < len; i++) if (morae[i] === m) return i;
    return -1;
  };
  // Polite forms: accent on ま (ます, ました), on せ (ません), on しょ (ましょう).
  const ma = idx("ま");
  if (ma >= 0) {
    const next = morae[ma + 1];
    if (next === "せ" || next === "しょ") return ma + 2;
    if (next === "す" || next === "し") return ma + 1;
  }
  if (dict === 0) return 0;
  // い-adjectives: たかい(2) → たかかった / たかくて / たかければ (1)
  if (entry.reading.endsWith("い") && /^[かくけ]/.test(reading.slice(p))) return Math.max(1, dict - 1);
  // te/ta forms of accented verbs: ichidan shift back a mora (たべ^る → た^べて),
  // godan keep it (かえ^る… か^えって, はな^す → はな^して, ある^く → ある^いて)
  const te = morae.findIndex((m, i) => i >= from && /^[てでただ]$/.test(m));
  if (te >= 1) {
    const stem = morae.slice(0, te).join("");
    const ichidan = entry.reading.endsWith("る") && stem === entry.reading.slice(0, -1);
    return settle(Math.max(1, Math.min(ichidan ? dict - 1 : dict, te)), morae);
  }
  // negative: 食べない → たべ^ない
  const na = idx("な");
  if (na >= 1) return settle(na, morae);
  return Math.min(dict, len);
}

interface Mark {
  /** INITIAL_LOW, HIGH, or DROPPED_LOW minus the low morae since the drop. */
  level: number;
  /** Catathesis offset (≤ 0). */
  register: number;
  /** Accent phrase number, counted over the whole passage. */
  phrase: number;
  /** Sentence number (bumped after 。！？). */
  sentence: number;
}

/** Accent marks per character of the target (shared by the contour and the melody). */
function accentMarks(tokens: Token[]): Mark[] {
  const out: Mark[] = [];
  let register = 0; // catathesis, ≤ 0
  let phrasePos = -1; // mora index within the current phrase; -1 = no phrase yet
  let dropped = false;
  let afterDrop = 0; // low morae since the drop
  let level = INITIAL_LOW;
  let phrase = -1;
  let sentence = 0;

  const push = (chars: string, lv: number) => {
    for (let i = 0; i < chars.length; i++)
      out.push({ level: lv, register, phrase: Math.max(0, phrase), sentence });
  };
  const startPhrase = () => {
    if (dropped) register = Math.max(-MAX_CATATHESIS, register - CATATHESIS);
    phrasePos = 0;
    dropped = false;
    afterDrop = 0;
    phrase++;
  };
  const lowAfterDrop = () => Math.max(FLOOR, DROPPED_LOW - afterDrop++);

  for (const w of words(tokens)) {
    if (w.punct) {
      push(w.reading, level);
      if ([...w.reading].some((c) => SENTENCE_END.has(c))) {
        register = 0;
        dropped = false;
        sentence++;
      }
      phrasePos = -1; // next word starts fresh
      continue;
    }
    const morae = getKanaMorae(w.reading);
    const aux = AUXILIARIES[w.reading];
    const isParticle = PARTICLES.has(w.reading) && !/[^\u3040-\u309f]/.test(w.reading);

    if ((aux !== undefined || isParticle) && phrasePos >= 0) {
      // continue the phrase
      morae.forEach((m, i) => {
        let lv: number;
        if (dropped) lv = lowAfterDrop();
        else if (phrasePos === 0) lv = INITIAL_LOW;
        else lv = HIGH;
        if (!dropped && aux !== undefined && i === aux - 1) dropped = true; // last high mora
        phrasePos++;
        level = lv;
        push(m, lv);
      });
      continue;
    }

    startPhrase();
    const n = aux ?? downstepFor(w.reading, w.entry);
    morae.forEach((m, i) => {
      let lv: number;
      if (dropped) lv = lowAfterDrop();
      else if (i === 0 && n !== 1) lv = INITIAL_LOW;
      else lv = HIGH;
      if (n > 0 && i === n - 1) dropped = true;
      phrasePos++;
      level = lv;
      push(m, lv);
    });
  }
  return out;
}

/** Per-character pitch (semitones above the low base) for the passage's target string. */
export function accentContour(tokens: Token[]): number[] {
  return accentMarks(tokens).map((m) => m.register + m.level);
}

// ---- singing: the contour as a melody in a key ----

/** Major pentatonic steps; degrees continue into the next octave. */
const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** Singing range in semitones from A4; the key's tonic is the lowest note. */
export interface VoiceRange {
  low: number;
  high: number;
}
/** Default: D4–E5, in D major pentatonic. */
export const DEFAULT_RANGE: VoiceRange = { low: -7, high: 7 };
/** Sanitises a user range: −24…+24 semitones from A4, at least a fifth wide. */
export function clampRange(r: VoiceRange): VoiceRange {
  const low = Math.max(-24, Math.min(17, Math.round(r.low)));
  const high = Math.max(low + 7, Math.min(24, Math.round(r.high)));
  return { low, high };
}

/** Semitones above the tonic of a pentatonic scale degree (may be negative). */
export function degreeSemis(d: number): number {
  const oct = Math.floor(d / PENTATONIC.length);
  return oct * 12 + (PENTATONIC[d - oct * PENTATONIC.length] as number);
}

/** Highest scale degree that fits in `span` semitones. */
export function topDegree(span: number): number {
  let d = 0;
  while (degreeSemis(d + 1) <= span) d++;
  return d;
}

/** Degrees below the phrase top for each accent level. */
/** A high plateau sinks one scale step per this many high morae… */
const DRIFT_EVERY = 3;
/** …by at most this many steps. */
const MAX_DRIFT = 2;

function stepFor(level: number): number {
  if (level >= HIGH) return 0;
  if (level === INITIAL_LOW) return -1;
  return -2 + Math.max(-1, level - DROPPED_LOW); // first low after the drop -2, then -3
}

/**
 * The accent contour sung as a melody: notes in semitones from A4, in the major
 * pentatonic of `range.low`, never outside the range. Every rise and drop of the accent
 * is kept (high = phrase top, the phrase-initial low one step under, the drop two steps
 * under), while the phrase tops walk gently — high at each sentence start, tending
 * downward — so it sounds like a tune rather than two alternating notes. Deterministic.
 */
export function accentMelody(tokens: Token[], range: VoiceRange = DEFAULT_RANGE): number[] {
  const { low, high } = clampRange(range);
  const maxDeg = topDegree(high - low);
  // tops wander in the upper part of the range, leaving room for the drops below them
  const topMax = maxDeg;
  const topMin = Math.min(topMax, Math.max(3, maxDeg - 3));
  const topStart = Math.max(topMin, topMax - 1);
  const marks = accentMarks(tokens);
  const tops: number[] = [];
  let top = topStart;
  let lastSentence = 0;
  let lastPhrase = -1;
  // morae sung high so far in this phrase: a long plateau (heiban + particles) drifts
  // down a step every DRIFT_EVERY of them, like speech declination, instead of droning
  let highs = 0;
  return marks.map((m) => {
    if (m.phrase !== lastPhrase) {
      highs = 0;
      if (m.sentence !== lastSentence || lastPhrase < 0) top = topStart;
      else {
        // a small hash so the walk is varied but repeatable
        const h = (Math.imul(m.phrase + 1, 2654435761) >>> 0) % 5;
        const move = [-1, -1, 0, 1, -2][h] as number;
        top = Math.max(topMin, Math.min(topMax, top + move));
        if (top === tops[tops.length - 1] && top === tops[tops.length - 2]) top += top > topMin ? -1 : 1;
        top = Math.min(topMax, top);
      }
      tops.push(top);
      lastPhrase = m.phrase;
      lastSentence = m.sentence;
    }
    const drift = Math.min(MAX_DRIFT, Math.floor(highs / DRIFT_EVERY));
    if (m.level >= HIGH) highs++;
    // drops are measured from where the plateau has drifted to, so they stay audible
    return low + degreeSemis(Math.max(0, top - drift + stepFor(m.level)));
  });
}

/** Fits a free-running pentatonic note (semitones above a tonic, ≥ 0) into the range. */
export function fitToRange(semisAboveTonic: number, range: VoiceRange = DEFAULT_RANGE): number {
  const { low, high } = clampRange(range);
  let n = semisAboveTonic;
  while (low + n > high && n >= 12) n -= 12;
  return Math.min(high, low + n);
}

/** Note name for semitones from A4 ("D4", "C#5"). */
export function noteName(semis: number): string {
  const names = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
  const i = ((semis % 12) + 12) % 12;
  return `${names[i]}${4 + Math.floor((semis + 9) / 12)}`;
}
