// Passage generation through local `claude -p` or `codex exec`.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Backend, Level } from "../src/lib/core/types.ts";
import type { RawToken } from "./normalize.ts";

export interface LlmPassage {
  translation: string;
  tokens: RawToken[];
}

export const PASSAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["translation", "tokens"],
  properties: {
    translation: { type: "string" },
    tokens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["groups"],
        properties: {
          groups: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["t", "r"],
              properties: { t: { type: "string" }, r: { type: "string" } },
            },
          },
        },
      },
    },
  },
} as const;

const LEVEL_DESC: Record<Level, string> = {
  N5: "JLPT N5 (absolute beginner): only the most basic vocabulary and kanji, simple です/ます sentences",
  N4: "JLPT N4 (elementary): everyday vocabulary, basic conjugations, short compound sentences",
  N3: "JLPT N3 (intermediate): common everyday and some abstract vocabulary, natural mixed-register sentences",
  N2: "JLPT N2 (upper intermediate): newspaper-ish vocabulary, more kanji compounds, complex clauses",
  N1: "JLPT N1 (advanced): sophisticated vocabulary, idioms, formal written style",
  native:
    "native level: literary or editorial prose with rich vocabulary, uncommon kanji compounds and idioms",
};

export function buildPrompt(level: Level, length: number, topic: string, seed: number): string {
  return [
    "You write practice passages for a Japanese typing test.",
    `Write natural, interesting Japanese prose of roughly ${length} kana when read aloud (±20%), at ${LEVEL_DESC[level]}.`,
    topic.trim()
      ? `Topic: ${topic.trim()}.`
      : `Pick a fresh everyday or cultural topic yourself (variety seed ${seed}); avoid clichés like weather small talk.`,
    "Use complete sentences ending in 。, ！ or ？. Use 、 normally. You may use 「」 for quotes.",
    "Do NOT use: Latin letters, Arabic digits (write numbers in kanji), spaces, emoji, or symbols other than 、。！？「」ー.",
    "",
    "Output format: split the passage into tokens (words, as a morphological analyzer would: particles and auxiliaries separate,",
    "but keep conjugated verb endings like 食べました together). Each token has ruby groups `groups`: a list of {t, r} where t is",
    "a piece of the written text and r is its reading in hiragana (katakana words: r = the katakana itself).",
    "Split groups as finely as possible: one group per kanji when its reading is separable (日本 → 日/に, 本/ほん),",
    "okurigana as separate groups (食べる → 食/た, べる/べる), and keep jukujikun/ateji together (今日/きょう, 大人/おとな).",
    "Punctuation is its own token with t = r = the mark. Concatenating every t must reproduce the passage exactly.",
    "Readings must be correct for the context (e.g. 一日 as ついたち vs いちにち). `translation` is a natural English translation.",
  ].join("\n");
}

export class LlmError extends Error {}

async function run(cmd: string[], cwd: string, timeoutMs: number): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  if (code !== 0) {
    throw new LlmError(`${cmd[0]} exited with ${code}: ${(err || out).trim().slice(-400)}`);
  }
  return out;
}

export function backendAvailable(b: Backend): boolean {
  return Bun.which(b) !== null;
}

export async function generate(
  backend: Backend,
  model: string,
  prompt: string,
  timeoutMs = 180_000,
): Promise<LlmPassage> {
  // Run from an empty temp dir so neither CLI picks up project instructions.
  const dir = await mkdtemp(join(tmpdir(), "weebtype-"));
  try {
    let text: string;
    if (backend === "claude") {
      const cmd = [
        "claude",
        "-p",
        prompt,
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(PASSAGE_SCHEMA),
        "--tools",
        "",
        "--no-session-persistence",
        "--setting-sources",
        "",
      ];
      if (model.trim()) cmd.push("--model", model.trim());
      const out = await run(cmd, dir, timeoutMs);
      const env = JSON.parse(out) as { is_error?: boolean; result?: string; structured_output?: unknown };
      if (env.is_error) throw new LlmError(`claude error: ${env.result ?? "unknown"}`);
      if (env.structured_output) return env.structured_output as LlmPassage;
      text = env.result ?? "";
    } else {
      const schemaPath = join(dir, "schema.json");
      const outPath = join(dir, "out.json");
      await Bun.write(schemaPath, JSON.stringify(PASSAGE_SCHEMA));
      const cmd = [
        "codex",
        "exec",
        "--output-schema",
        schemaPath,
        "-o",
        outPath,
        "--ephemeral",
        "--skip-git-repo-check",
        "-s",
        "read-only",
      ];
      if (model.trim()) cmd.push("-m", model.trim());
      cmd.push(prompt);
      await run(cmd, dir, timeoutMs);
      text = await Bun.file(outPath).text();
    }
    try {
      return JSON.parse(text) as LlmPassage;
    } catch {
      throw new LlmError(`${backend} returned non-JSON output: ${text.slice(0, 200)}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
