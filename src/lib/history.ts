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
const MAX = 2000;

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
  saveHistory(list);
  return list;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// ---- import / export -------------------------------------------------------

export const EXPORT_FORMAT = "weebtype-history";

export function exportHistory(entries: HistoryEntry[]): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, exported: Date.now(), entries }, null, 2);
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function validEntry(v: unknown): HistoryEntry | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (!num(e.at) || !num(e.kpm) || !num(e.accuracy)) return null;
  return {
    at: e.at,
    level: (typeof e.level === "string" ? e.level : "N4") as Level,
    source: (typeof e.source === "string" ? e.source : "claude") as PassageSource,
    preview: typeof e.preview === "string" ? e.preview.slice(0, 40) : "",
    kpm: e.kpm,
    keysPerMin: num(e.keysPerMin) ? e.keysPerMin : 0,
    accuracy: Math.max(0, Math.min(1, e.accuracy)),
    seconds: num(e.seconds) ? e.seconds : 0,
    kana: num(e.kana) ? e.kana : 0,
  };
}

/** Parse an export file (or a bare array of entries). Throws on unreadable input. */
export function parseHistoryFile(text: string): { entries: HistoryEntry[]; invalid: number } {
  const data: unknown = JSON.parse(text);
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { entries?: unknown }).entries)
      ? (data as { entries: unknown[] }).entries
      : null;
  if (!raw) throw new Error("not a weebtype history file");
  const entries: HistoryEntry[] = [];
  let invalid = 0;
  for (const r of raw) {
    const e = validEntry(r);
    if (e) entries.push(e);
    else invalid++;
  }
  return { entries, invalid };
}

/** Merge imported entries into existing ones; same timestamp + speed = duplicate. Newest first. */
export function mergeHistory(
  existing: HistoryEntry[],
  incoming: HistoryEntry[],
): { list: HistoryEntry[]; added: number } {
  const key = (e: HistoryEntry) => `${e.at}|${e.kpm.toFixed(3)}`;
  const seen = new Set(existing.map(key));
  const fresh = incoming.filter((e) => {
    const k = key(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const list = [...existing, ...fresh].sort((a, b) => b.at - a.at).slice(0, MAX);
  return { list, added: fresh.length };
}

export function saveHistory(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // ignore (quota / private mode)
  }
}
