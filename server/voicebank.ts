// Optional UTAU voicebank for the battle singer. The user unzips a Japanese CV (or
// VCV/CVVC) voicebank into data/voice/; nothing is bundled. We pick the oto.ini with
// the most usable entries (banks often have one folder per pitch) and serve its samples.

import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { characterName, type OtoEntry, parseOto, pitchTag, type Voicebank } from "../src/lib/core/oto.ts";

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
  const otos = files.filter((f) => f.toLowerCase().endsWith(`${sep}oto.ini`));
  const entries: OtoEntry[] = [];
  const dirs = new Set<string>();
  for (const oto of otos) {
    const dir = relative(root, join(oto, "..")).split(sep).join("/");
    for (const e of parseOto(await readText(oto), dir)) {
      // every pitch set sings; other expressions (strong, whisper…) don't
      const tag = pitchTag(e.alias, dir);
      if (tag === "expression") continue;
      if (!(await Bun.file(join(root, e.file)).exists())) continue;
      entries.push(tag ? { ...e, pitch: tag } : e);
      dirs.add(dir);
    }
  }
  if (entries.length === 0) return null;
  // character.txt sits in the bank root: the shallowest one above the sample folders
  let name: string | null = null;
  const chars = files
    .filter((f) => f.endsWith(`${sep}character.txt`))
    .sort((x, y) => x.split(sep).length - y.split(sep).length);
  for (const c of chars) {
    name = characterName(await readText(c));
    if (name) break;
  }
  const first = [...dirs][0] ?? "";
  return { name: name ?? (first.split("/")[0] || "voicebank"), entries };
}

/** Resolves a sample path from the client, refusing anything outside the voice dir. */
export function samplePath(rel: string, root = VOICE_DIR): string | null {
  const p = resolve(root, rel);
  return p.startsWith(root + sep) && p.toLowerCase().endsWith(".wav") ? p : null;
}
