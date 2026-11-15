// A tiny formant-synth "vocal" for the battle mode: every typed kana is sung as a
// short syllable — a sawtooth voice through three vowel formant filters, with a
// noise burst for the consonant and a little scoop up into the note, which is what
// gives it its synthetic-singer feel. No samples; everything is generated.
//
// Each note is rendered with an OfflineAudioContext into a WAV blob and played by an
// <audio> element (cached per syllable + pitch). Live Web Audio output — even routed
// into a media element — was silent on a real Chromium + PipeWire setup where <audio>
// with a file source plays fine, so the voice only ever uses the latter.
//
// Pitches are absolute notes (semitones from A4) in F major pentatonic: the battle passes
// the passage's accent melody (core/accent.ts accentMelody). Notes are polyphonic — each
// rings out to its end even when the next starts — so fast typing doesn't cut them off.

import {
  clampRange,
  DEFAULT_RANGE,
  degreeSemis,
  fitToRange,
  topDegree,
  type VoiceRange,
} from "./core/accent.ts";
import { estimateF0 } from "./core/f0.ts";
import { type OtoEntry, OtoIndex, type Voicebank } from "./core/oto.ts";
import { Melody, type Onset, type Syllable, syllables, type Vowel } from "./core/voice.ts";
import { encodeWav } from "./core/wav.ts";

/** Formant centre frequencies (Hz), tuned a bit high for a bright, young voice. */
const FORMANTS: Record<Vowel | "n", readonly [number, number, number]> = {
  a: [900, 1350, 2900],
  i: [330, 2750, 3400],
  u: [380, 1550, 2700],
  e: [560, 2250, 3000],
  o: [560, 950, 2850],
  n: [280, 1250, 2600],
};
const FORMANT_GAIN = [1, 0.55, 0.28] as const;
const FORMANT_Q = [6, 11, 16] as const;

/** Where the formants start for each onset before gliding to the vowel. */
const ONSET_FORMANTS: Partial<Record<Onset, readonly [number, number, number]>> = {
  nasal: [260, 1100, 2500],
  liquid: [420, 1400, 1900],
  glideY: [300, 2700, 3300],
  glideW: [330, 700, 2500],
  voiced: [300, 1300, 2600],
};

/** Noise colour (band-pass centre Hz) and length (s) per consonant. */
function noiseFor(s: Syllable): { freq: number; q: number; dur: number; gain: number } | null {
  const c = s.consonant;
  switch (s.onset) {
    case "plosive":
      return {
        freq: c.startsWith("p") ? 900 : c.startsWith("t") ? 4200 : 2100,
        q: 1.2,
        dur: 0.018,
        gain: 0.5,
      };
    case "voiced":
      return {
        freq: c.startsWith("b") ? 600 : c.startsWith("d") ? 3200 : 1700,
        q: 1.2,
        dur: 0.012,
        gain: 0.25,
      };
    case "affricate":
      return { freq: c === "ts" ? 6500 : 3800, q: 2, dur: 0.05, gain: 0.45 };
    case "fricative":
      if (c === "s") return { freq: 7000, q: 2.5, dur: 0.07, gain: 0.45 };
      if (c === "sh") return { freq: 3700, q: 2, dur: 0.075, gain: 0.5 };
      return { freq: 1600, q: 0.7, dur: 0.05, gain: 0.3 }; // h / f
    case "buzz":
      return { freq: 5200, q: 2, dur: 0.05, gain: 0.25 };
    default:
      return null;
  }
}

/** A4: note numbers are semitones from here. */
const BASE_HZ = 440;
const NOTE_LEN = 0.17;
/** Voicebank notes keep more of the recorded vowel, so they sound sung, not clipped. */
const BANK_NOTE_LEN = 0.3;
/** Most consonant lead-in kept from a sample (cuts breaths recorded before it). */
const MAX_LEAD = 0.11;
/** Notes allowed to ring at once; the oldest is stopped beyond this. */
const MAX_VOICES = 6;
const SAMPLE_RATE = 44100;
/** Longest consonant lead-in + note + release. */
const RENDER_LEN = 0.06 + NOTE_LEN + 0.12;
/** Each note scoops up from this many semitones below. */
const SCOOP = 1.5;
/** Gap between syllables completed by one key (e.g. ん + next kana). */
const STAGGER_MS = 85;

const hzOf = (semis: number) => BASE_HZ * 2 ** (semis / 12);

/** Builds one sung syllable into `ctx`, starting at `t0`. Works on any context. */
function buildNote(
  ctx: BaseAudioContext,
  out: AudioNode,
  noiseBuf: AudioBuffer,
  s: Syllable,
  hz: number,
  fromHz: number,
  t0: number,
): void {
  const noise = noiseFor(s);
  const voiceAt = t0 + (s.onset === "fricative" || s.onset === "affricate" ? (noise?.dur ?? 0) * 0.7 : 0.004);
  const end = voiceAt + NOTE_LEN;

  // voice: saw + vibrato, gliding up into the pitch
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(fromHz, voiceAt);
  osc.frequency.exponentialRampToValueAtTime(hz, voiceAt + 0.045);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.8;
  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, voiceAt);
  vibDepth.gain.linearRampToValueAtTime(hz * 0.012, end);
  vib.connect(vibDepth).connect(osc.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, voiceAt);
  env.gain.linearRampToValueAtTime(1, voiceAt + (s.hold ? 0.06 : s.onset === "nasal" ? 0.03 : 0.012));
  env.gain.setValueAtTime(1, end - 0.05);
  env.gain.exponentialRampToValueAtTime(0.001, end + 0.06);
  env.connect(out);

  const target = FORMANTS[s.vowel ?? "a"];
  const from = ONSET_FORMANTS[s.onset];
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = FORMANT_Q[i] as number;
    const f = target[i] as number;
    if (from) {
      bp.frequency.setValueAtTime(from[i] as number, voiceAt);
      bp.frequency.exponentialRampToValueAtTime(f, voiceAt + 0.055);
    } else bp.frequency.setValueAtTime(f, voiceAt);
    const g = ctx.createGain();
    // band-passing a saw loses a lot of level; make it back up per formant
    g.gain.value = (FORMANT_GAIN[i] as number) * (s.vowel === "n" ? 2 : 3.2);
    osc.connect(bp).connect(g).connect(env);
  }
  // a little low body so it isn't all buzz
  const body = ctx.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.value = 700;
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.12;
  osc.connect(body).connect(bodyGain).connect(env);

  osc.start(voiceAt);
  vib.start(voiceAt);
  osc.stop(end + 0.1);
  vib.stop(end + 0.1);

  // consonant: a coloured noise burst just before the vowel
  if (noise) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = noise.freq;
    bp.Q.value = noise.q;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(noise.gain, t0);
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + noise.dur);
    src.connect(bp).connect(ng).connect(out);
    src.start(t0);
    src.stop(t0 + noise.dur + 0.01);
  }
}

/** Renders one syllable to samples (normalised to a 0.8 peak). */
export async function renderSyllable(s: Syllable, semis: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(SAMPLE_RATE * RENDER_LEN), SAMPLE_RATE);
  const noise = ctx.createBuffer(1, Math.ceil(SAMPLE_RATE * 0.1), SAMPLE_RATE);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const hz = hzOf(semis);
  buildNote(ctx, ctx.destination, noise, s, hz, hz * 2 ** (-SCOOP / 12), 0);
  const data = (await ctx.startRendering()).getChannelData(0);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] = ((data[i] as number) * 0.8) / peak;
  return data;
}

// ---- optional UTAU voicebank (data/voice/, served by /api/voice) ----

export interface LoadedBank {
  name: string;
  index: OtoIndex;
}

let bankPromise: Promise<LoadedBank | null> | null = null;

/** The user's voicebank, if one is installed (fetched once). */
export function voicebank(): Promise<LoadedBank | null> {
  // the static build has no server, so never a user voicebank
  bankPromise ??= __STATIC__
    ? Promise.resolve(null)
    : fetch("/api/voice")
        .then((r) => (r.ok ? (r.json() as Promise<{ bank: Voicebank | null }>) : null))
        .then((j) => {
          const bank = j?.bank;
          if (!bank) return null;
          const index = new OtoIndex(bank.entries);
          return index.size ? { name: bank.name, index } : null;
        })
        .catch(() => null);
  return bankPromise;
}

interface Sample {
  data: Float32Array;
  rate: number;
}
const samples = new Map<string, Promise<Sample | null>>();

function loadSample(file: string): Promise<Sample | null> {
  let p = samples.get(file);
  if (!p) {
    p = fetch(`/api/voice/sample?p=${encodeURIComponent(file)}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(buf))
      .then((b) => ({ data: b.getChannelData(0), rate: b.sampleRate }))
      .catch(() => null);
    samples.set(file, p);
  }
  return p;
}

/** Vowel pitch of a sample (Hz), measured just after the consonant. */
function sampleF0(s: Sample, e: OtoEntry): number | null {
  const start = Math.floor(((e.offset + Math.max(e.consonant, e.preutter)) / 1000) * s.rate);
  const win = s.data.subarray(start, start + Math.floor(0.06 * s.rate));
  return win.length > 512 ? estimateF0(win, s.rate) : null;
}

/** Pitch of the bank's untagged (main) set, measured on its "a"; tagged sets are named by note. */
let mainRef: Promise<number | null> | null = null;
function mainHz(bank: LoadedBank): Promise<number | null> {
  mainRef ??= (async () => {
    // without a target, find() prefers the untagged set
    const e = bank.index.find({ kana: "あ", onset: "none", consonant: "", vowel: "a", at: 0 });
    if (!e || e.pitch) return null;
    const s = await loadSample(e.file);
    return s ? sampleF0(s, e) : null;
  })();
  return mainRef;
}

/** Cuts a note from a voicebank sample and resamples it to `targetHz`. */
/**
 * How a note enters: "attack" (consonant + vowel), "hold" (starts inside the vowel, for
 * ー/long vowels), "glide" (a VCV transition "a い", entered softly through its blend).
 */
type Entry = "attack" | "hold" | "glide";

async function renderSample(
  e: OtoEntry,
  s: Sample,
  targetHz: number,
  how: Entry = "attack",
): Promise<Float32Array> {
  const hold = how === "hold";
  const f0 = sampleF0(s, e) ?? targetHz;
  const rate = Math.max(0.5, Math.min(2, targetHz / f0));
  const total = s.data.length / s.rate;
  const off = e.offset / 1000;
  const end = e.cutoff < 0 ? off - e.cutoff / 1000 : total - e.cutoff / 1000;
  const fullLead = Math.max(e.consonant, e.preutter) / 1000;
  // start at most MAX_LEAD before the vowel: anything earlier is breath/silence
  // a held vowel starts inside the vowel (no consonant, no attack)
  // a glide keeps a short stretch of the previous vowel so the transition is heard
  const lead = hold ? 0 : how === "glide" ? Math.min(fullLead, 0.07) : Math.min(fullLead, MAX_LEAD);
  const start = off + fullLead - lead + (hold ? 0.03 : 0);
  // consonant as recorded, then about one note of vowel (both in source time)
  const srcDur = Math.max(0.05, Math.min(end - start, lead + (BANK_NOTE_LEN + 0.08) * rate));
  const outDur = srcDur / rate;
  const ctx = new OfflineAudioContext(1, Math.ceil(SAMPLE_RATE * (outDur + 0.01)), SAMPLE_RATE);
  const buf = ctx.createBuffer(1, s.data.length, s.rate);
  buf.copyToChannel(s.data as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(1, hold ? 0.06 : how === "glide" ? 0.045 : 0.006);
  g.gain.setValueAtTime(1, Math.max(0.01, outDur - 0.12));
  g.gain.linearRampToValueAtTime(0, outDur);
  src.connect(g).connect(ctx.destination);
  src.start(0, start, srcDur);
  const data = (await ctx.startRendering()).getChannelData(0);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] = ((data[i] as number) * 0.8) / peak;
  return data;
}

/** Short volume ramp then pause (element volume, no live Web Audio). */
function fadeOut(a: HTMLAudioElement, secs: number): void {
  const v0 = a.volume;
  const t0 = performance.now();
  const step = () => {
    const k = (performance.now() - t0) / (secs * 1000);
    if (k >= 1 || a.paused) {
      a.pause();
      return;
    }
    a.volume = v0 * (1 - k);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export class Singer {
  private readonly melody = new Melody();
  private lastSemis = 0;
  private lastVowel: Vowel | null = null;
  private volume = 0.4;
  private range: VoiceRange = DEFAULT_RANGE;
  /** Rendered notes as blob URLs; each play gets its own element so notes overlap. */
  private readonly cache = new Map<string, Promise<string | null>>();
  /** Notes still sounding, oldest first. */
  private readonly ringing: HTMLAudioElement[] = [];

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  setRange(r: VoiceRange): void {
    this.range = clampRange(r);
  }

  /**
   * Sing newly typed kana. `notes` (semitones from A4 per char of `text`, from the
   * passage's accent melody) set the pitch; without them a pentatonic melody wanders.
   */
  sing(text: string, notes?: readonly number[], long?: readonly boolean[]): void {
    if (this.volume <= 0) return;
    // `long`: per char of `text`, a long vowel inside a kanji reading (longVowelMask)
    const sylls = syllables(text, this.lastVowel, (at) => long?.[at] === true);
    if ([...text].some((c) => "、。！？」".includes(c))) this.melody.cadence();
    sylls.forEach((s, i) => {
      const delay = i * STAGGER_MS;
      if (s.vowel === null) {
        // っ: a held breath — stop the note before it
        setTimeout(() => this.ringing[this.ringing.length - 1]?.pause(), delay);
        this.lastVowel = null;
        return;
      }
      // ん and っ end the vowel: what follows them can't glide or hold from it
      this.lastVowel = s.vowel === "n" ? null : s.vowel;
      // ー holds the same pitch; everything else takes the next melody note
      const note = notes?.[s.at];
      const semis =
        note !== undefined ? note : s.hold ? this.lastSemis : fitToRange(this.melody.next(), this.range);
      this.lastSemis = semis;
      this.play(s, semis, delay);
    });
  }

  /** A short "ra-ra-ra" so volume and range can be checked from settings. */
  /** One sung note: the top of the range (where accented morae go), or `semis` if given. */
  preview(semis?: number): void {
    this.melody.reset();
    const { low, high } = this.range;
    this.sing("ら", [semis ?? low + degreeSemis(topDegree(high - low))]);
  }

  reset(): void {
    this.melody.reset();
    this.lastVowel = null;
  }

  /** Stop every sounding note (battle mode closed). */
  sleep(): void {
    for (const a of this.ringing) a.pause();
    this.ringing.length = 0;
  }

  private url(s: Syllable, semis: number): Promise<string | null> {
    return voicebank().then(async (bank) => {
      const hz = hzOf(semis);
      const entry = bank ? bank.index.find(s, hz, await mainHz(bank)) : null;
      const glide =
        !s.hold && !!s.from && !!entry && entry.alias.includes(" ") && !entry.alias.startsWith("-");
      const how: Entry = s.hold ? "hold" : glide ? "glide" : "attack";
      const h = how === "attack" ? "" : `|${how}`;
      const key = entry
        ? `${entry.file}|${entry.alias}|${semis}${h}`
        : `${s.onset}|${s.consonant}|${s.vowel}|${semis}${h}`;
      let url = this.cache.get(key);
      if (!url) {
        url = (async () => {
          let data: Float32Array | null = null;
          if (entry) {
            const sample = await loadSample(entry.file);
            if (sample) data = await renderSample(entry, sample, hz, how);
          }
          data ??= await renderSyllable(s, semis);
          return URL.createObjectURL(encodeWav(data, SAMPLE_RATE));
        })().catch(() => null);
        this.cache.set(key, url);
      }
      return url;
    });
  }

  private play(s: Syllable, semis: number, delay: number): void {
    const due = performance.now() + delay;
    void this.url(s, semis).then((url) => {
      if (!url) return;
      setTimeout(
        () => {
          const a = new Audio(url);
          a.volume = Math.min(1, this.volume ** 1.5 * 0.85);
          // a glide/hold carries the previous vowel itself: hand over instead of doubling it
          const prev = this.ringing[this.ringing.length - 1];
          if (prev && (s.hold || s.from)) fadeOut(prev, 0.05);
          const done = () => {
            const i = this.ringing.indexOf(a);
            if (i >= 0) this.ringing.splice(i, 1);
          };
          a.addEventListener("ended", done, { once: true });
          a.addEventListener("pause", done, { once: true });
          this.ringing.push(a);
          while (this.ringing.length > MAX_VOICES) this.ringing.shift()?.pause();
          void a.play().catch(done);
        },
        Math.max(0, due - performance.now()),
      );
    });
  }
}

/** One shared voice for the whole app. */
export const singer = new Singer();
