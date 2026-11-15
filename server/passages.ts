// Passage service: LLM generation, validation, dictionary annotation, prefetch queue
// (persisted to disk so unused passages survive restarts), and offline fallback.

import { mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { isKana, isKanji, isPunct } from "../src/lib/core/kana.ts";
import type { GenerateRequest, Passage, PassageResponse, Token } from "../src/lib/core/types.ts";
import type { Dictionary } from "./dictionary.ts";
import { buildPrompt, DEFAULT_LLAMA_URL, generate } from "./llm.ts";
import { nameEntry, normalizeTokens, type ProperName, translationFor, trimToLength } from "./normalize.ts";
import { BUILTIN, type Tatoeba } from "./tatoeba.ts";
import { Variety } from "./variety.ts";

interface Pending {
  promise: Promise<Passage>;
  claimed: boolean;
}

const PREFETCH = 1;
/** Ready passages kept per settings key (normally ≤ PREFETCH; guards against races). */
const MAX_READY = 5;
const CACHE_VERSION = 1;

export function endpointFor(r: GenerateRequest): string {
  return (r.endpoint?.trim() || DEFAULT_LLAMA_URL).replace(/\/+$/, "");
}

function key(r: GenerateRequest): string {
  const base = [r.backend, r.model.trim(), r.level, r.length, r.topic.trim()];
  return JSON.stringify(r.backend === "llama" ? [...base, endpointFor(r)] : base);
}

function isPassage(v: unknown): v is Passage {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Partial<Passage>;
  return typeof p.id === "string" && Array.isArray(p.tokens) && p.tokens.length > 0;
}

export class PassageService {
  private readonly ready = new Map<string, Passage[]>();
  private readonly pending = new Map<string, Pending[]>();
  /** Served to the client but not typed yet, by passage id. Dropped only by `consume`. */
  private readonly leased = new Map<string, { key: string; passage: Passage }>();
  /** Shown and skipped without typing: not served again this run, but kept (restored on restart). */
  private readonly skipped = new Map<string, Passage[]>();
  dict: Dictionary | null = null;
  tatoeba: Tatoeba | null = null;
  readonly variety = new Variety();
  private saving: Promise<void> = Promise.resolve();

  /** `cacheFile`: where generated-but-unused passages are kept across restarts (none in tests). */
  constructor(private readonly cacheFile?: string) {}

  /** Load passages generated in earlier runs that were never served. */
  async loadCache(): Promise<number> {
    if (!this.cacheFile) return 0;
    const f = Bun.file(this.cacheFile);
    if (!(await f.exists())) return 0;
    let n = 0;
    try {
      const raw = (await f.json()) as { v?: unknown; ready?: unknown };
      if (raw.v !== CACHE_VERSION || typeof raw.ready !== "object" || raw.ready === null) return 0;
      for (const [k, list] of Object.entries(raw.ready as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue;
        const ok = list.filter(isPassage).slice(-MAX_READY);
        if (!ok.length) continue;
        this.ready.set(k, [...ok, ...(this.ready.get(k) ?? [])]);
        n += ok.length;
      }
    } catch (e) {
      console.warn(`[passages] ignoring unreadable cache ${this.cacheFile}: ${String(e)}`);
    }
    return n;
  }

  /**
   * Write every untyped passage to disk (serialised; atomic rename): the ready queues, then
   * passages on loan to the client, then skipped ones — all come back as ready on restart.
   */
  private persist(): void {
    const file = this.cacheFile;
    if (!file) return;
    this.saving = this.saving.then(async () => {
      const ready: Record<string, Passage[]> = {};
      const add = (k: string, p: Passage) => {
        ready[k] ??= [];
        ready[k].push(p);
      };
      for (const [k, list] of this.ready) for (const p of list) add(k, p);
      for (const { key: k, passage } of this.leased.values()) add(k, passage);
      for (const [k, list] of this.skipped) for (const p of list) add(k, p);
      try {
        await mkdir(dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        await Bun.write(tmp, JSON.stringify({ v: CACHE_VERSION, ready }));
        await rename(tmp, file);
      } catch (e) {
        console.warn(`[passages] couldn't save cache: ${String(e)}`);
      }
    });
  }

  private lease(k: string, passage: Passage): Passage {
    this.leased.set(passage.id, { key: k, passage });
    this.persist();
    return passage;
  }

  /** The user started typing this passage: it's used up. */
  consume(id: string): void {
    if (this.leased.delete(id)) this.persist();
  }

  /**
   * The client moved on without typing it. `skipped` (the user asked for a different one):
   * park it so this run doesn't show it again; otherwise (tab closed, settings changed,
   * request cancelled) put it back at the front of its queue.
   */
  release(id: string, skipped: boolean): void {
    const l = this.leased.get(id);
    if (!l) return;
    this.leased.delete(id);
    const map = skipped ? this.skipped : this.ready;
    const list = map.get(l.key) ?? [];
    if (skipped) list.push(l.passage);
    else list.unshift(l.passage);
    map.set(l.key, list.slice(skipped ? -MAX_READY : 0, skipped ? undefined : MAX_READY));
    this.persist();
  }

  /** Resolves once pending cache writes are on disk. */
  flush(): Promise<void> {
    return this.saving;
  }

  /** `names`: proper nouns the LLM reported, used where the dictionary has no entry. */
  annotate(tokens: Token[], names: readonly ProperName[] = []): Token[] {
    const dict = this.dict;
    if (!dict) return tokens;
    // Entries for a kana token that was consumed as the okurigana of the token before it.
    let carried: Token["dict"] | undefined;
    return tokens.map((tok, i) => {
      if (carried) {
        const d = carried;
        carried = undefined;
        return { ...tok, dict: d };
      }
      let surface = tok.groups.map((g) => g.t).join("");
      if ([...surface].every(isPunct)) return tok;
      let reading = tok.groups.map((g) => g.r).join("");
      let extended = false;
      // A bare-kanji token followed by kana (Tatoeba: 歩 | いて行きますか) may be a
      // verb/adjective stem: take the longest kana extension that is an inflected form
      // with this reading (歩いて → 歩く), like a Yomitan scan.
      const next = tokens[i + 1];
      const nextText = next?.groups.map((g) => g.t).join("") ?? "";
      if (isKanji(surface.at(-1) ?? "") && nextText && [...nextText].every(isKana)) {
        for (let k = Math.min(nextText.length, 8); k > 0; k--) {
          const ext = nextText.slice(0, k);
          if (dict.isInflectedWord(surface + ext, reading + ext)) {
            surface += ext;
            reading += ext;
            extended = true;
            break;
          }
        }
      }
      const entries = dict.lookup(surface, reading);
      if (extended && entries.length) carried = entries;
      if (entries.length) return { ...tok, dict: entries };
      const name = nameEntry(surface, reading, names);
      return name ? { ...tok, dict: [name] } : tok;
    });
  }

  private async generateOne(req: GenerateRequest): Promise<Passage> {
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      // A fresh direction per attempt; parallel prefetches each draw a different one.
      const direction = this.variety.next();
      const prompt = buildPrompt(req.level, req.length, this.variety.promptLines(direction, req.topic));
      const dict = this.dict;
      const raw = await generate(req.backend, req.model, prompt, {
        endpoint: endpointFor(req),
        words: dict ? (w) => dict.writtenReadings(w) : undefined,
      });
      const norm = normalizeTokens(raw.tokens ?? [], this.dict);
      const allowed = Math.max(2, Math.floor(norm.tokens.length * 0.08));
      if (norm.tokens.length < 3) {
        lastErr = "empty passage";
        continue;
      }
      if (norm.problems.length > allowed) {
        lastErr = `too many reading problems: ${norm.problems.slice(0, 3).join("; ")}`;
        console.warn(`[passages] rejected (${req.backend}): ${lastErr}`);
        continue;
      }
      if (norm.problems.length)
        console.warn(`[passages] accepted with problems: ${norm.problems.join("; ")}`);
      this.variety.record(direction, norm.tokens.map((t) => t.groups.map((g) => g.t).join("")).join(""));
      const kept = trimToLength(norm.tokens, req.length);
      return {
        id: crypto.randomUUID(),
        source: req.backend,
        level: req.level,
        topic: req.topic.trim() || undefined,
        translation: translationFor(raw.translations ?? [], norm.tokens, kept),
        tokens: this.annotate(kept, raw.names ?? []),
      };
    }
    throw new Error(lastErr);
  }

  private startOne(req: GenerateRequest): Pending {
    const k = key(req);
    const p: Pending = { promise: this.generateOne(req), claimed: false };
    const list = this.pending.get(k) ?? [];
    list.push(p);
    this.pending.set(k, list);
    const remove = () => {
      const l = this.pending.get(k) ?? [];
      this.pending.set(
        k,
        l.filter((x) => x !== p),
      );
    };
    p.promise.then(
      (passage) => {
        remove();
        if (!p.claimed) {
          const q = this.ready.get(k) ?? [];
          q.push(passage);
          this.ready.set(k, q.slice(-MAX_READY));
          this.persist();
        }
      },
      (err: unknown) => {
        remove();
        if (!p.claimed) console.warn(`[passages] prefetch failed: ${String(err)}`);
      },
    );
    return p;
  }

  prefetch(req: GenerateRequest): void {
    const k = key(req);
    const have =
      (this.ready.get(k)?.length ?? 0) + (this.pending.get(k)?.filter((p) => !p.claimed).length ?? 0);
    for (let i = have; i < PREFETCH; i++) this.startOne(req);
  }

  fallback(req: GenerateRequest): Passage {
    const p = this.tatoeba && this.tatoeba.size > 0 ? this.tatoeba.passage(req.level, req.length) : BUILTIN;
    return { ...p, tokens: this.annotate(p.tokens) };
  }

  async get(req: GenerateRequest): Promise<PassageResponse> {
    const k = key(req);
    const q = this.ready.get(k);
    const ready = q?.shift();
    if (ready) {
      this.prefetch(req);
      return { passage: this.lease(k, ready) };
    }
    const pend = this.pending.get(k)?.find((p) => !p.claimed) ?? this.startOne(req);
    pend.claimed = true;
    try {
      const passage = await pend.promise;
      this.prefetch(req);
      return { passage: this.lease(k, passage) };
    } catch (err) {
      // A passage skipped earlier beats an offline sentence.
      const old = this.skipped.get(k)?.shift();
      return {
        passage: old ? this.lease(k, old) : this.fallback(req),
        warning: `Couldn't generate with ${req.backend}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  status(req: GenerateRequest): { ready: number; pending: number } {
    const k = key(req);
    return { ready: this.ready.get(k)?.length ?? 0, pending: this.pending.get(k)?.length ?? 0 };
  }
}
