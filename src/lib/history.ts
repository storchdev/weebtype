// Result history in localStorage.

import type { Stats } from "./core/session.ts";
import type { Level, PassageSource } from "./core/types.ts";

export interface HistoryEntry {
  at: number;
  level: Level;
  source: PassageSource;
  preview: string;
  kpm: number;
  keysPerMin: number;
  accuracy: number;
  seconds: number;
  kana: number;
}

const KEY = "weebtype.history.v1";
const MAX = 300;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function addHistory(
  stats: Stats,
  level: Level,
  source: PassageSource,
  preview: string,
): HistoryEntry[] {
  const entry: HistoryEntry = {
    at: Date.now(),
    level,
    source,
    preview: preview.slice(0, 40),
    kpm: stats.kpm,
    keysPerMin: stats.keysPerMin,
    accuracy: stats.accuracy,
    seconds: stats.seconds,
    kana: stats.kana,
  };
  const list = [entry, ...loadHistory()].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return list;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
