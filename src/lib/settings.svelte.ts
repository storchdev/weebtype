// User settings, persisted to localStorage.

import { type Backend, LEVELS, type Level } from "./core/types.ts";
import { FONTS } from "./fonts.ts";

export type HintMode = "full" | "romaji" | "off";
export type DisplayMode = "paragraph" | "ticker";
export type ThemeMode = "system" | "light" | "dark";

export interface Settings {
  backend: Backend;
  claudeModel: string;
  codexModel: string;
  level: Level;
  length: number;
  topic: string;
  hint: HintMode;
  display: DisplayMode;
  theme: ThemeMode;
  font: string;
  fontSize: number;
  petals: boolean;
}

export const DEFAULTS: Settings = {
  backend: "claude",
  claudeModel: "sonnet",
  codexModel: "",
  level: "N4",
  length: 100,
  topic: "",
  hint: "full",
  display: "paragraph",
  theme: "system",
  font: "noto-sans",
  fontSize: 34,
  petals: true,
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
    backend: oneOf(r.backend, ["claude", "codex"] as const, DEFAULTS.backend),
    claudeModel: str(r.claudeModel, DEFAULTS.claudeModel),
    codexModel: str(r.codexModel, DEFAULTS.codexModel),
    level: oneOf(r.level, LEVELS, DEFAULTS.level),
    length: num(r.length, 20, 1000, DEFAULTS.length),
    topic: str(r.topic, ""),
    hint: oneOf(r.hint, ["full", "romaji", "off"] as const, DEFAULTS.hint),
    display: oneOf(r.display, ["paragraph", "ticker"] as const, DEFAULTS.display),
    theme: oneOf(r.theme, ["system", "light", "dark"] as const, DEFAULTS.theme),
    font: oneOf(
      r.font,
      FONTS.map((f) => f.id),
      DEFAULTS.font,
    ),
    fontSize: num(r.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, DEFAULTS.fontSize),
    petals: typeof r.petals === "boolean" ? r.petals : DEFAULTS.petals,
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

export function currentModel(s: Settings): string {
  return s.backend === "claude" ? s.claudeModel : s.codexModel;
}
