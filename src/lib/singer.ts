// A tiny formant-synth "vocal" for the battle mode: every typed kana is sung as a
// short syllable — a sawtooth voice through three vowel formant filters, with a
// noise burst for the consonant and a little portamento between notes, which is
// what gives it its synthetic-singer feel. No samples; everything is generated.

import { Melody, type Onset, type Syllable, syllables, type Vowel } from "./core/voice.ts";

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

/** A4. The melody walks two octaves of pentatonic up from here. */
const BASE_HZ = 440;
const NOTE_LEN = 0.17;

export class Singer {
  private ctx: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly melody = new Melody();
  private lastHz = BASE_HZ;
  private lastVowel: Vowel | null = null;
  /** The note currently sounding; cut short when the next one starts (monophonic). */
  private current: { env: GainNode; stopAt: number } | null = null;
  private volume = 0.4;
  private readonly makeContext: () => BaseAudioContext | null;

  /** `makeContext` is overridable so the voice can be rendered offline (checks, tests). */
  constructor(
    makeContext: () => BaseAudioContext | null = () =>
      typeof AudioContext === "undefined" ? null : new AudioContext({ latencyHint: "interactive" }),
  ) {
    this.makeContext = makeContext;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.gainFor(), this.ctx.currentTime, 0.02);
  }

  private gainFor(): number {
    return this.volume * this.volume * 0.9;
  }

  /** Must first be called from a user gesture (a keydown) so the context may start. */
  private ensure(): BaseAudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && this.ctx instanceof AudioContext) void this.ctx.resume();
      return this.ctx;
    }
    const ctx = this.makeContext();
    if (!ctx) return null;
    const master = ctx.createGain();
    master.gain.value = this.gainFor();
    // gentle glue so fast typing doesn't pile up into clipping
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    master.connect(comp).connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.master = master;
    this.noise = noise;
    return ctx;
  }

  /** Sing newly typed kana. Punctuation ends a phrase. `at` overrides "now" (offline rendering). */
  sing(text: string, at?: number): void {
    if (this.volume <= 0) return;
    const sylls = syllables(text, this.lastVowel);
    if ([...text].some((c) => "、。！？」".includes(c))) this.melody.cadence();
    if (sylls.length === 0) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    let t = (at ?? ctx.currentTime) + 0.005;
    for (const s of sylls) {
      if (s.vowel === null) {
        // っ: a held breath — just cut the previous note
        this.cut(t);
        t += 0.05;
        continue;
      }
      if (s.vowel !== "n") this.lastVowel = s.vowel;
      // ー holds the same pitch; everything else takes the next melody note
      const hz = s.kana === "ー" || s.kana === "〜" ? this.lastHz : BASE_HZ * 2 ** (this.melody.next() / 12);
      this.note(ctx, this.master, s, hz, t);
      t += NOTE_LEN * 0.5;
    }
  }

  reset(): void {
    this.melody.reset();
    this.lastVowel = null;
  }

  private cut(at: number): void {
    const c = this.current;
    if (!c || c.stopAt <= at) return;
    c.env.gain.cancelScheduledValues(at);
    c.env.gain.setTargetAtTime(0, at, 0.012);
    this.current = null;
  }

  private note(ctx: BaseAudioContext, out: AudioNode, s: Syllable, hz: number, t0: number): void {
    const noise = noiseFor(s);
    const voiceAt =
      t0 + (s.onset === "fricative" || s.onset === "affricate" ? (noise?.dur ?? 0) * 0.7 : 0.004);
    const end = voiceAt + NOTE_LEN;
    this.cut(voiceAt);

    // --- voice: saw + vibrato, gliding in from the previous pitch
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(this.lastHz, voiceAt);
    osc.frequency.exponentialRampToValueAtTime(hz, voiceAt + 0.045);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.8;
    const vibDepth = ctx.createGain();
    vibDepth.gain.setValueAtTime(0, voiceAt);
    vibDepth.gain.linearRampToValueAtTime(hz * 0.012, voiceAt + NOTE_LEN);
    vib.connect(vibDepth).connect(osc.frequency);
    this.lastHz = hz;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, voiceAt);
    env.gain.linearRampToValueAtTime(1, voiceAt + (s.onset === "nasal" ? 0.03 : 0.012));
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
    this.current = { env, stopAt: end + 0.06 };

    // --- consonant: a coloured noise burst just before the vowel
    if (noise && this.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = noise.freq;
      bp.Q.value = noise.q;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(noise.gain, t0);
      ng.gain.exponentialRampToValueAtTime(0.001, t0 + noise.dur);
      src.connect(bp).connect(ng).connect(out);
      src.start(t0, Math.random() * 0.5);
      src.stop(t0 + noise.dur + 0.01);
    }
  }
}
