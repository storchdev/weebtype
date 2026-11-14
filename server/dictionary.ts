// Jitendex dictionary + pitch + examples lookup, ported from 10ff-yomitan/content.js.
// Data files live in data/, built from public sources by scripts/setup-data.ts.

import { join } from "node:path";
import { allKana, toHiragana } from "../src/lib/core/kana.ts";
import type { DictEntry, DictExample } from "../src/lib/core/types.ts";
import { japaneseTransforms, LanguageTransformer } from "./vendor/deinflect.js";

interface RawEntry {
  w: string;
  r: string;
  ru: string;
  s: number;
  t: string[];
  d: string[];
}
type RawDict = Record<string, RawEntry[]>;
type RawPitch = Record<string, Array<{ r: string; p: number[] }>>;
export type RawExamples = Record<string, Array<{ r: string; e: DictExample[] }>>;

export const DATA_DIR = join(import.meta.dir, "..", "data");

interface Match {
  entry: RawEntry;
  /** Surface text that was looked up. */
  surface: string;
  /** The lemma text the entry was found under. */
  lemma: string;
}

export class Dictionary {
  private readonly index = new Map<string, RawEntry[]>();
  private readonly transformer = new LanguageTransformer();

  constructor(
    dict: RawDict,
    private readonly pitch: RawPitch,
    private readonly examples: RawExamples,
  ) {
    this.transformer.addDescriptor(japaneseTransforms);
    // Index by surface form and by reading (many words are written in kana).
    const add = (key: string, e: RawEntry) => {
      const b = this.index.get(key);
      if (b) b.push(e);
      else this.index.set(key, [e]);
    };
    for (const key in dict) {
      for (const e of dict[key] ?? []) {
        add(e.w, e);
        if (e.r && e.r !== e.w) add(e.r, e);
      }
    }
    for (const b of this.index.values()) b.sort((a, c) => c.s - a.s);
  }

  static async load(dir = DATA_DIR): Promise<Dictionary | null> {
    const f = (n: string) => Bun.file(join(dir, n));
    if (!(await f("dictionary.json").exists())) return null;
    const [dict, pitch, examples] = await Promise.all([
      f("dictionary.json").json() as Promise<RawDict>,
      f("pitch.json")
        .json()
        .catch(() => ({})) as Promise<RawPitch>,
      f("examples.json")
        .json()
        .catch(() => ({})) as Promise<RawExamples>,
    ]);
    return new Dictionary(dict, pitch, examples);
  }

  private matches(word: string): Match[] {
    const out: Match[] = [];
    const seen = new Set<RawEntry>();
    const exact = this.index.get(word);
    for (const entry of exact ?? []) {
      seen.add(entry);
      out.push({ entry, surface: word, lemma: word });
    }
    // Collect every deinflection candidate (行った → 行く and 行う).
    for (const cand of this.transformer.transform(word)) {
      if (cand.conditions === 0) continue;
      const entries = this.index.get(cand.text);
      if (!entries) continue;
      for (const e of entries) {
        if (seen.has(e)) continue;
        if (e.ru) {
          const flags = this.transformer.getConditionFlagsFromPartsOfSpeech(e.ru.split(" "));
          if (!LanguageTransformer.conditionsMatch(cand.conditions, flags)) continue;
        }
        seen.add(e);
        out.push({ entry: e, surface: word, lemma: cand.text });
      }
    }
    return out;
  }

  /**
   * Possible kana readings of `surface` (hiragana), derived from dictionary entries.
   * Inflected forms map the lemma reading's suffix onto the surface suffix.
   * Returns null when the word is unknown.
   */
  readingsFor(surface: string): Set<string> | null {
    const ms = this.matches(surface);
    if (ms.length === 0) return null;
    const out = new Set<string>();
    for (const m of ms) {
      const r = this.surfaceReading(m);
      if (r !== null) out.add(r);
    }
    return out;
  }

  /** Reading of the surface form implied by a match (lemma reading with the suffix swapped). */
  private surfaceReading({ entry, surface, lemma }: Match): string | null {
    let p = 0;
    while (p < surface.length && p < lemma.length && surface[p] === lemma[p]) p++;
    const sSuf = surface.slice(p);
    const lSuf = lemma.slice(p);
    if (lSuf !== "" && !allKana(lSuf)) return null;
    const r = toHiragana(entry.r);
    const lSufH = toHiragana(lSuf);
    if (!r.endsWith(lSufH)) return null;
    return r.slice(0, r.length - lSufH.length) + toHiragana(sSuf);
  }

  private lookupPitch(term: string, reading: string): number | null {
    const es = this.pitch[term];
    if (!es) return null;
    const m = es.find((e) => e.r === reading) ?? es[0];
    return m?.p[0] ?? null;
  }

  private lookupExample(term: string, reading: string): DictExample | null {
    const es = this.examples[term];
    if (!es) return null;
    const m = es.find((e) => e.r === reading) ?? es[0];
    return m?.e[0] ?? null;
  }

  /**
   * Dictionary entries for the hint card. When `reading` is given, entries with a
   * matching reading are ranked first.
   */
  /**
   * True if `surface` (with this reading) is an inflecting word: a verb/adjective form
   * reached by deinflection (歩いて → 歩く) or a verb/adjective dictionary form. Noun
   * compounds that happen to exist (本の) don't count.
   */
  isInflectedWord(surface: string, reading: string): boolean {
    const want = toHiragana(reading);
    return this.matches(surface).some(
      (m) =>
        this.surfaceReading(m) === want &&
        (m.entry.w !== surface || m.entry.t.some((t) => /dan|verb|adjective/.test(t))),
    );
  }

  lookup(surface: string, reading?: string, max = 3): DictEntry[] {
    let ms = this.matches(surface);
    if (reading) {
      const want = toHiragana(reading);
      // Reading matches first; among those, entries written exactly as the surface
      // (の the particle before 野 for a kana token).
      const good = ms
        .filter((m) => this.surfaceReading(m) === want)
        .sort((a, b) => Number(b.entry.w === surface) - Number(a.entry.w === surface));
      ms = [...good, ...ms.filter((m) => !good.includes(m))];
    }
    const seen = new Set<string>();
    const out: DictEntry[] = [];
    for (const { entry: e } of ms) {
      const key = `${e.w}|${e.r}|${e.d[0] ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        term: e.w,
        reading: e.r,
        pitch: this.lookupPitch(e.w, e.r),
        tags: e.t.slice(0, 4),
        defs: e.d.slice(0, 5),
        example: out.length === 0 ? this.lookupExample(e.w, e.r) : null,
        deinflectedFrom: e.w !== surface && e.r !== surface ? surface : null,
      });
      if (out.length >= max) break;
    }
    return out;
  }

  get rawExamples(): RawExamples {
    return this.examples;
  }
}
