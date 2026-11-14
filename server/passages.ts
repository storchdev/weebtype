// Passage service: LLM generation, validation, dictionary annotation, prefetch queue,
// and offline fallback.

import { isPunct } from "../src/lib/core/kana.ts";
import type { GenerateRequest, Passage, PassageResponse, Token } from "../src/lib/core/types.ts";
import type { Dictionary } from "./dictionary.ts";
import { buildPrompt, generate } from "./llm.ts";
import { normalizeTokens, trimToLength } from "./normalize.ts";
import { BUILTIN, type Tatoeba } from "./tatoeba.ts";

interface Pending {
  promise: Promise<Passage>;
  claimed: boolean;
}

const PREFETCH = 2;

function key(r: GenerateRequest): string {
  return JSON.stringify([r.backend, r.model.trim(), r.level, r.length, r.topic.trim()]);
}

export class PassageService {
  private readonly ready = new Map<string, Passage[]>();
  private readonly pending = new Map<string, Pending[]>();
  dict: Dictionary | null = null;
  tatoeba: Tatoeba | null = null;

  annotate(tokens: Token[]): Token[] {
    const dict = this.dict;
    if (!dict) return tokens;
    return tokens.map((tok) => {
      const surface = tok.groups.map((g) => g.t).join("");
      if ([...surface].every(isPunct)) return tok;
      const reading = tok.groups.map((g) => g.r).join("");
      const entries = dict.lookup(surface, reading);
      return entries.length ? { ...tok, dict: entries } : tok;
    });
  }

  private async generateOne(req: GenerateRequest): Promise<Passage> {
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = buildPrompt(req.level, req.length, req.topic, Math.floor(Math.random() * 1e6));
      const raw = await generate(req.backend, req.model, prompt);
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
      return {
        id: crypto.randomUUID(),
        source: req.backend,
        level: req.level,
        topic: req.topic.trim() || undefined,
        translation: raw.translation,
        tokens: this.annotate(trimToLength(norm.tokens, req.length)),
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
          this.ready.set(k, q);
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
      return { passage: ready };
    }
    const pend = this.pending.get(k)?.find((p) => !p.claimed) ?? this.startOne(req);
    pend.claimed = true;
    try {
      const passage = await pend.promise;
      this.prefetch(req);
      return { passage };
    } catch (err) {
      return {
        passage: this.fallback(req),
        warning: `Couldn't generate with ${req.backend}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /** Clear the queue for a request (e.g. when the user wants something fresh). */
  status(req: GenerateRequest): { ready: number; pending: number } {
    const k = key(req);
    return { ready: this.ready.get(k)?.length ?? 0, pending: this.pending.get(k)?.length ?? 0 };
  }
}
