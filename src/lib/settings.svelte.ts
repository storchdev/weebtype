// User settings, persisted to localStorage.

import { type Backend, LEVELS, type Level } from "./core/types.ts";
import { FONTS } from "./fonts.ts";

/** The guide under the current word: reading + romaji, reading only, or none. */
export type HintMode = "romaji" | "kana" | "off";
export type DisplayMode = "paragraph" | "ticker";
export type ThemeMode = "system" | "light" | "dark";

/** Where passages come from: an LLM CLI, or Tatoeba sentences only (no AI). */
export type Generator = Backend | "tatoeba";

export interface Settings {
  backend: Generator;
  claudeModel: string;
  codexModel: string;
  /** Model name passed to llama-server (usually ignored: it serves what it loaded). */
  llamaModel: string;
  /** llama-server base URL. */
  llamaUrl: string;
  level: Level;
  length: number;
  topic: string;
  hint: HintMode;
  /** Dictionary panel (meaning, pitch, example) under the text, independent of `hint`. */
  dictionary: boolean;
  display: DisplayMode;
  theme: ThemeMode;
  font: string;
  fontSize: number;
  petals: boolean;
  /** Opt-in: a singer sings each kana at a marshmallow boss whose HP is the passage. */
  battle: boolean;
  /** Singer voice volume, 0–100 (0 = silent). */
  battleVolume: number;
  /** Singer's lowest / highest note, semitones from A4 (the key is the lowest note's). */
  voiceLow: number;
  voiceHigh: number;
  /** Opt-in keyboard click sounds. */
  keySounds: boolean;
  /** 0–100 */
  keyVolume: number;
}

export const DEFAULTS: Settings = {
  backend: "claude",
  claudeModel: "sonnet",
  codexModel: "",
  llamaModel: "",
  llamaUrl: "http://127.0.0.1:8080",
  level: "N4",
  length: 100,
  topic: "",
  hint: "romaji",
  dictionary: true,
  display: "paragraph",
  theme: "system",
  font: "noto-sans",
  fontSize: 34,
  petals: true,
  battle: false,
  battleVolume: 40,
  voiceLow: -7,
  voiceHigh: 7,
  keySounds: false,
  keyVolume: 60,
};

export const LENGTH_PRESETS = [50, 100, 200, 400] as const;
export const FONT_SIZE_RANGE = { min: 18, max: 64 } as const;

const KEY = "weebtype.settings.v1";

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

function sanitize(raw: unknown): Settings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const num = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
  };
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  return {
    backend: oneOf(r.backend, ["claude", "codex", "llama", "tatoeba"] as const, DEFAULTS.backend),
    claudeModel: str(r.claudeModel, DEFAULTS.claudeModel),
    codexModel: str(r.codexModel, DEFAULTS.codexModel),
    llamaModel: str(r.llamaModel, DEFAULTS.llamaModel),
    llamaUrl: str(r.llamaUrl, DEFAULTS.llamaUrl),
    level: oneOf(r.level, LEVELS, DEFAULTS.level),
    length: num(r.length, 20, 1000, DEFAULTS.length),
    topic: str(r.topic, ""),
    // v1 had one `hint` setting where "full" meant romaji guide + dictionary.
    hint: r.hint === "full" ? "romaji" : oneOf(r.hint, ["romaji", "kana", "off"] as const, DEFAULTS.hint),
    dictionary:
      typeof r.dictionary === "boolean"
        ? r.dictionary
        : r.hint === undefined
          ? DEFAULTS.dictionary
          : r.hint === "full",
    display: oneOf(r.display, ["paragraph", "ticker"] as const, DEFAULTS.display),
    theme: oneOf(r.theme, ["system", "light", "dark"] as const, DEFAULTS.theme),
    font: oneOf(
      r.font,
      FONTS.map((f) => f.id),
      DEFAULTS.font,
    ),
    fontSize: num(r.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, DEFAULTS.fontSize),
    petals: typeof r.petals === "boolean" ? r.petals : DEFAULTS.petals,
    battle: typeof r.battle === "boolean" ? r.battle : DEFAULTS.battle,
    battleVolume: num(r.battleVolume, 0, 100, DEFAULTS.battleVolume),
    voiceLow: num(r.voiceLow, -24, 17, DEFAULTS.voiceLow),
    voiceHigh: num(r.voiceHigh, -17, 24, DEFAULTS.voiceHigh),
    keySounds: typeof r.keySounds === "boolean" ? r.keySounds : DEFAULTS.keySounds,
    keyVolume: num(r.keyVolume, 0, 100, DEFAULTS.keyVolume),
  };
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : {});
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = $state(load());

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode etc.) — settings just won't persist.
  }
}

/** True when passages should come from Tatoeba only, never an LLM. */
export function offlineOnly(s: Settings): boolean {
  return s.backend === "tatoeba";
}

export function currentModel(s: Settings): string {
  if (s.backend === "claude") return s.claudeModel;
  if (s.backend === "llama") return s.llamaModel;
  return s.codexModel;
}
