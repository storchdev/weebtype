// Pure converters from public dictionary sources to the data/*.json formats that
// server/dictionary.ts reads. Used by scripts/setup-data.ts; tested in tests/build-data.test.ts.

import type { DictExample } from "../src/lib/core/types.ts";

/** Yomitan term bank row: [term, reading, defTags, rules, score, glossary, sequence, termTags]. */
export type TermBankEntry = [string, string, string, string, number, unknown, number, string];

interface Node {
  tag?: string;
  data?: Record<string, string>;
  content?: unknown;
}
const isNode = (n: unknown): n is Node => typeof n === "object" && n !== null && !Array.isArray(n);
const dataContent = (n: unknown) => (isNode(n) ? n.data?.content : undefined);

function* walk(n: unknown): Generator<unknown> {
  yield n;
  if (Array.isArray(n)) for (const c of n) yield* walk(c);
  else if (isNode(n) && n.content !== undefined) yield* walk(n.content);
}

/** Plain text of a node, skipping furigana (<rt>) and Tatoeba footnote markers. */
function text(n: unknown): string {
  if (typeof n === "string") return n;
  if (Array.isArray(n)) return n.map(text).join("");
  if (!isNode(n) || n.tag === "rt" || dataContent(n) === "attribution-footnote") return "";
  return text(n.content);
}

// --- dictionary.json -----------------------------------------------------------------

export interface DictRow {
  w: string;
  r: string;
  ru: string;
  s: number;
  t: string[];
  d: string[];
}

/** Flatten Jitendex structured content to {w, r, ru, s, t, d}, keyed by term. */
export function buildDictionary(entries: Iterable<TermBankEntry>): Record<string, DictRow[]> {
  const out: Record<string, DictRow[]> = {};
  for (const [w, r, , ru, s, glossary] of entries) {
    const tags: string[] = [];
    const defs: string[] = [];
    for (const n of walk(glossary)) {
      if (!isNode(n)) continue;
      if (n.data?.class === "tag" && typeof n.content === "string") {
        if (!tags.includes(n.content)) tags.push(n.content);
      } else if (n.data?.content === "glossary") {
        const items = Array.isArray(n.content) ? n.content : [n.content];
        for (const li of items) {
          const g = text(li).trim();
          if (g) defs.push(g);
        }
      }
    }
    if (defs.length === 0) continue;
    // biome-ignore lint/suspicious/noAssignInExpressions: bucket-or-create
    (out[w] ??= []).push({ w, r: r || w, ru, s, t: tags, d: defs });
  }
  return out;
}

// --- examples.json -------------------------------------------------------------------

const MAX_EXAMPLES_PER_READING = 3;

/** Japanese sentence → segments ({t, r?: furigana, k?: inside the target-word span}). */
function segments(n: unknown, keyword = false, out: DictExample["j"] = []): DictExample["j"] {
  if (typeof n === "string") {
    if (n) out.push(keyword ? { t: n, k: true } : { t: n });
  } else if (Array.isArray(n)) {
    for (const c of n) segments(c, keyword, out);
  } else if (isNode(n)) {
    if (n.tag === "ruby") {
      const parts = Array.isArray(n.content) ? n.content : [n.content];
      const base = parts.filter((c) => typeof c === "string").join("");
      const reading = parts.map((c) => (isNode(c) && c.tag === "rt" ? text(c.content) : "")).join("");
      if (base) out.push({ t: base, ...(reading ? { r: reading } : {}), ...(keyword ? { k: true } : {}) });
    } else {
      segments(n.content, keyword || dataContent(n) === "example-keyword", out);
    }
  }
  return out;
}

const firstDescendant = (n: unknown, want: string) => {
  for (const c of walk(n)) if (dataContent(c) === want) return c as Node;
  return undefined;
};

/** Pull Jitendex's embedded Tatoeba sentences out, keyed by term then reading. */
export function buildExamples(
  entries: Iterable<TermBankEntry>,
): Record<string, Array<{ r: string; e: DictExample[] }>> {
  const byTerm = new Map<string, Map<string, DictExample[]>>();
  for (const [term, reading, , , , glossary] of entries) {
    const seenSources = new Set<string>();
    for (const n of walk(glossary)) {
      if (dataContent(n) !== "example-sentence" || !isNode(n)) continue;
      const source = n.data?.source ?? "";
      if (seenSources.has(source)) continue;
      const a = firstDescendant(n.content, "example-sentence-a");
      const b = firstDescendant(n.content, "example-sentence-b");
      if (!a || !b) continue;
      const j = segments(a.content);
      const t = text(b.content).trim();
      if (j.length === 0 || !t) continue;
      seenSources.add(source);
      const readings = byTerm.get(term) ?? new Map<string, DictExample[]>();
      byTerm.set(term, readings);
      const bucket = readings.get(reading) ?? [];
      readings.set(reading, bucket);
      if (bucket.length < MAX_EXAMPLES_PER_READING && !bucket.some((x) => x.t === t)) bucket.push({ j, t });
    }
  }
  const out: Record<string, Array<{ r: string; e: DictExample[] }>> = {};
  for (const [term, readings] of byTerm) out[term] = [...readings].map(([r, e]) => ({ r, e }));
  return out;
}

// --- pitch.json ----------------------------------------------------------------------

/**
 * Kanjium accents.txt (`term\treading\taccents`, accents like `2`, `0,2` or `(副)0,(名)3`)
 * → {term: [{r, p: [downstep positions]}]}. Full-width digits in terms are normalised.
 */
export function buildPitch(tsv: string): Record<string, Array<{ r: string; p: number[] }>> {
  const out: Record<string, Array<{ r: string; p: number[] }>> = {};
  for (const line of tsv.split("\n")) {
    // Kana-only words leave the reading column empty.
    const [rawTerm, rawReading, accents] = line.replace(/\r$/, "").split("\t");
    if (!rawTerm || !accents) continue;
    const reading = rawReading || rawTerm;
    const p = [...new Set([...accents.matchAll(/\d+/g)].map((m) => Number(m[0])))];
    if (p.length === 0) continue;
    const term = rawTerm.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    for (const t of new Set([rawTerm, term])) {
      // biome-ignore lint/suspicious/noAssignInExpressions: bucket-or-create
      const rows = (out[t] ??= []);
      if (!rows.some((x) => x.r === reading)) rows.push({ r: reading, p });
    }
  }
  return out;
}
