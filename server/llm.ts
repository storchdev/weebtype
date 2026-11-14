// Passage generation through local `claude -p`, `codex exec`, or a llama-server endpoint.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Backend, Level } from "../src/lib/core/types.ts";
import type { ProperName, RawToken } from "./normalize.ts";

export interface LlmPassage {
  /** One English translation per Japanese sentence, in order (so trimming can keep them in step). */
  translations: string[];
  tokens: RawToken[];
  /** Proper nouns used (the dictionary has no names): token text + short English gloss. */
  names?: ProperName[];
}

export const PASSAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["translations", "names", "tokens"],
  properties: {
    translations: { type: "array", items: { type: "string" } },
    names: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["w", "en"],
        properties: { w: { type: "string" }, en: { type: "string" } },
      },
    },
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

/**
 * Fixed instructions, identical for every request so they form a cacheable prefix
 * (Claude prompt cache, OpenAI prefix cache, llama-server KV reuse). Everything that
 * varies per passage goes in `buildPrompt`'s user part, after this.
 */
export const SYSTEM_PROMPT = [
  "You write practice passages for a Japanese typing test.",
  "Write natural, interesting Japanese prose at the requested level and length (length = kana when read aloud, ±20%).",
  "Write one cohesive passage, not a collection of unrelated practice sentences. If there are multiple sentences, each must build on the previous one.",
  "Keep the same characters, setting, point of view and tense throughout. Develop one scene, short story or connected idea with a clear progression and a natural ending within the requested length.",
  "Use specific names, places, objects and details rather than generic statements.",
  "Avoid stock openings like 今日は, 私は…です or talk about the weather unless the subject is about it.",
  "Use complete sentences ending in 。, ！ or ？. Use 、 normally. You may use 「」 for quotes.",
  "Do NOT use: Latin letters, Arabic digits (write numbers in kanji), spaces, emoji, or symbols other than 、。！？「」ー.",
  "",
  "Output format: JSON only. Split the passage into tokens (words, as a morphological analyzer would: particles and auxiliaries separate,",
  "but keep conjugated verb endings like 食べました together). Each token has ruby groups `groups`: a list of {t, r} where t is",
  "a piece of the written text and r is its reading in hiragana (katakana words: r = the katakana itself).",
  "Split groups as finely as possible: one group per kanji when its reading is separable (日本 → 日/に, 本/ほん),",
  "okurigana as separate groups (食べる → 食/た, べる/べる), and keep jukujikun/ateji together (今日/きょう, 大人/おとな).",
  "Punctuation is its own token with t = r = the mark. Concatenating every t must reproduce the passage exactly.",
  "Readings must be correct for the context (e.g. 一日 as ついたち vs いちにち). `translations` has one natural English translation per Japanese sentence, in the same order (a quoted 「…。」 belongs to the sentence around it).",
  "`names` lists every proper noun you used (people, places, shops, pets…) exactly as its token is written (w = 健太) with a short",
  'English gloss (en = "Kenta (male given name)"); split a full name into one entry per token (山田 and 健太). Empty if none.',
].join("\n");

export interface Prompt {
  system: string;
  user: string;
}

/** `steer` are the subject/form/variety lines from `Variety.promptLines`. */
export function buildPrompt(level: Level, length: number, steer: string[]): Prompt {
  return {
    system: SYSTEM_PROMPT,
    user: [`Level: ${LEVEL_DESC[level]}.`, `Length: roughly ${length} kana.`, ...steer].join("\n"),
  };
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

/** llama-server base URL used when the request doesn't name one. */
export const DEFAULT_LLAMA_URL = (process.env.WEEBTYPE_LLAMA_URL ?? "http://127.0.0.1:8080").replace(
  /\/+$/,
  "",
);

/** CLI backends: is the binary on PATH. llama: does the server answer `/health`. */
export async function backendAvailable(b: Backend, endpoint = DEFAULT_LLAMA_URL): Promise<boolean> {
  if (b !== "llama") return Bun.which(b) !== null;
  try {
    const res = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** llama-server's OpenAI-compatible endpoint, schema-constrained via a grammar. */
async function generateLlama(
  endpoint: string,
  model: string,
  prompt: Prompt,
  timeoutMs: number,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        ...(model.trim() ? { model: model.trim() } : {}),
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "passage", strict: true, schema: PASSAGE_SCHEMA },
        },
        // Reuse the KV cache for the shared system-prompt prefix.
        cache_prompt: true,
        temperature: 0.8,
      }),
    });
  } catch (e) {
    throw new LlmError(
      `llama-server at ${endpoint} unreachable: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!res.ok) throw new LlmError(`llama-server ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? "";
}

export async function generate(
  backend: Backend,
  model: string,
  prompt: Prompt,
  endpoint = DEFAULT_LLAMA_URL,
  timeoutMs = backend === "llama" ? 600_000 : 180_000,
): Promise<LlmPassage> {
  if (backend === "llama") return parse(backend, await generateLlama(endpoint, model, prompt, timeoutMs));
  // Run from an empty temp dir so neither CLI picks up project instructions.
  const dir = await mkdtemp(join(tmpdir(), "weebtype-"));
  try {
    let text: string;
    if (backend === "claude") {
      const cmd = [
        "claude",
        "-p",
        prompt.user,
        // Replaces Claude Code's own (large) system prompt: far fewer input tokens, and the
        // fixed instructions become a stable cached prefix.
        "--system-prompt",
        prompt.system,
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(PASSAGE_SCHEMA),
        "--tools",
        "",
        // No MCP servers (their tool definitions would be sent with every request).
        "--strict-mcp-config",
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
      // Fixed part first so OpenAI's automatic prefix cache can reuse it.
      cmd.push(`${prompt.system}\n\n${prompt.user}`);
      await run(cmd, dir, timeoutMs);
      text = await Bun.file(outPath).text();
    }
    return parse(backend, text);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function parse(backend: Backend, text: string): LlmPassage {
  try {
    return JSON.parse(text) as LlmPassage;
  } catch {
    throw new LlmError(`${backend} returned non-JSON output: ${text.slice(0, 200)}`);
  }
}
