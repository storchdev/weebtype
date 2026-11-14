// Optional UTAU voicebank for the battle singer. The user unzips a Japanese CV (or
// VCV/CVVC) voicebank into data/voice/; nothing is bundled. We pick the oto.ini with
// the most usable entries (banks often have one folder per pitch) and serve its samples.

import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { baseAlias, characterName, type OtoEntry, parseOto, type Voicebank } from "../src/lib/core/oto.ts";

export const VOICE_DIR = resolve(import.meta.dir, "..", "data", "voice");

/** UTAU files are usually Shift-JIS; fall back to UTF-8 when that decodes cleanly. */
async function readText(path: string): Promise<string> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

async function walk(dir: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const out: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, d.name);
    // follow symlinks, so a bank can be linked in instead of copied
    const isDir = d.isDirectory() || (d.isSymbolicLink() && (await stat(p).catch(() => null))?.isDirectory());
    if (isDir) out.push(...(await walk(p, depth + 1)));
    else out.push(p);
  }
  return out;
}

export async function loadVoicebank(root = VOICE_DIR): Promise<Voicebank | null> {
  const files = await walk(root);
  const otos = files.filter(
    (f) => f.toLowerCase().endsWith(`${sep}oto.ini`) || f.toLowerCase() === "oto.ini",
  );
  let best: OtoEntry[] = [];
  let bestScore = 0;
  let bestDir = "";
  for (const oto of otos) {
    const dir = relative(root, join(oto, "..")).split(sep).join("/");
    const entries = parseOto(await readText(oto), dir);
    const usable: OtoEntry[] = [];
    for (const e of entries) if (await Bun.file(join(root, e.file)).exists()) usable.push(e);
    // the natural set has plain aliases ("- か"); pitch/expression sets carry suffixes
    const score = usable.filter((e) => baseAlias(e.alias) === e.alias).length * 4 + usable.length;
    if (score > bestScore) {
      bestScore = score;
      best = usable;
      bestDir = dir;
    }
  }
  if (best.length === 0) return null;
  // character.txt sits in the bank root, which may be above the chosen pitch folder
  let name: string | null = null;
  const parts = bestDir ? bestDir.split("/") : [];
  for (let i = parts.length; i >= 0 && !name; i--) {
    const p = join(root, ...parts.slice(0, i), "character.txt");
    if (await Bun.file(p).exists()) name = characterName(await readText(p));
  }
  return { name: name ?? (parts[0] || "voicebank"), entries: best };
}

/** Resolves a sample path from the client, refusing anything outside the voice dir. */
export function samplePath(rel: string, root = VOICE_DIR): string | null {
  const p = resolve(root, rel);
  return p.startsWith(root + sep) && p.toLowerCase().endsWith(".wav") ? p : null;
}
