// Typing session over a Passage: maps romaji engine progress onto tokens and ruby groups.

import { isPunct } from "./kana.ts";
import { RomajiEngine } from "./romaji.ts";
import type { Passage } from "./types.ts";

export interface GroupSpan {
  token: number;
  /** Index within token.groups. */
  index: number;
  start: number;
  end: number;
}

export interface TokenSpan {
  start: number;
  end: number;
  firstGroup: number;
  lastGroup: number;
}

export interface Snapshot {
  kanaDone: number;
  /** Flat index of the group being typed (== groups.length when finished). */
  group: number;
  token: number;
  /** Kana of the current group already typed (shown as the caret composition). */
  pendingKana: string;
  /** Romaji typed toward the current unit. */
  buffer: string;
  finished: boolean;
  started: boolean;
  correctKeys: number;
  misses: number;
}

export interface Stats {
  /** Seconds from first key to last. */
  seconds: number;
  kana: number;
  keys: number;
  misses: number;
  /** Kana per minute. */
  kpm: number;
  /** Keystrokes per minute (correct keys only). */
  keysPerMin: number;
  /** 0..1 */
  accuracy: number;
  /** Per-token miss counts. */
  tokenMisses: number[];
  /** [secondsSinceStart, kanaDone] samples for a speed graph. */
  samples: Array<[number, number]>;
}

export class TypingSession {
  readonly passage: Passage;
  readonly target: string;
  readonly groups: GroupSpan[] = [];
  readonly tokens: TokenSpan[] = [];
  private readonly engine: RomajiEngine;
  private startedAt: number | null = null;
  private lastAt = 0;
  private correct = 0;
  private miss = 0;
  private readonly tokenMisses: number[];
  private readonly samples: Array<[number, number]> = [];
  private readonly countable: number;

  constructor(passage: Passage) {
    this.passage = passage;
    let target = "";
    passage.tokens.forEach((tok, ti) => {
      const firstGroup = this.groups.length;
      const tStart = target.length;
      tok.groups.forEach((g, gi) => {
        const start = target.length;
        target += g.r;
        this.groups.push({ token: ti, index: gi, start, end: target.length });
      });
      this.tokens.push({ start: tStart, end: target.length, firstGroup, lastGroup: this.groups.length - 1 });
    });
    this.target = target;
    this.engine = new RomajiEngine(target);
    this.tokenMisses = passage.tokens.map(() => 0);
    this.countable = [...target].filter((c) => !isPunct(c)).length;
  }

  get done(): boolean {
    return this.engine.done;
  }

  /** Returns true if the key was accepted. `now` is a ms timestamp (performance.now()). */
  press(key: string, now: number): boolean {
    if (this.engine.done) return false;
    const r = this.engine.press(key);
    if (this.startedAt === null) this.startedAt = now;
    this.lastAt = now;
    if (!r.ok) {
      this.miss++;
      const t = this.currentToken();
      if (t < this.tokenMisses.length) this.tokenMisses[t] = (this.tokenMisses[t] ?? 0) + 1;
      return false;
    }
    this.correct++;
    if (r.completed > 0) this.samples.push([(now - this.startedAt) / 1000, this.engine.kanaDone]);
    return true;
  }

  private currentGroup(): number {
    const done = this.engine.kanaDone;
    // Skip empty groups and groups fully covered.
    let lo = 0;
    let hi = this.groups.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.groups[mid] as GroupSpan).end <= done) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private currentToken(): number {
    const g = this.groups[this.currentGroup()];
    return g ? g.token : this.tokens.length;
  }

  snapshot(): Snapshot {
    const kanaDone = this.engine.kanaDone;
    const group = this.currentGroup();
    const g = this.groups[group];
    return {
      kanaDone,
      group,
      token: g ? g.token : this.tokens.length,
      pendingKana: g ? this.target.slice(g.start, Math.max(g.start, kanaDone)) : "",
      buffer: this.engine.buffer,
      finished: this.engine.done,
      started: this.startedAt !== null,
      correctKeys: this.correct,
      misses: this.miss,
    };
  }

  /** Romaji guide for a token: what's typed and what remains. */
  guide(token: number): { typed: string; rest: string } {
    const t = this.tokens[token];
    if (!t) return { typed: "", rest: "" };
    return this.engine.guide(t.start, t.end);
  }

  /** Kana for a token (its reading). */
  reading(token: number): string {
    const t = this.tokens[token];
    return t ? this.target.slice(t.start, t.end) : "";
  }

  stats(now: number = this.lastAt): Stats {
    const seconds = this.startedAt === null ? 0 : Math.max(0.001, (now - this.startedAt) / 1000);
    const doneText = this.target.slice(0, this.engine.kanaDone);
    const kana = this.engine.done ? this.countable : [...doneText].filter((c) => !isPunct(c)).length;
    const minutes = seconds / 60;
    const total = this.correct + this.miss;
    return {
      seconds,
      kana,
      keys: this.correct,
      misses: this.miss,
      kpm: minutes > 0 ? kana / minutes : 0,
      keysPerMin: minutes > 0 ? this.correct / minutes : 0,
      accuracy: total > 0 ? this.correct / total : 1,
      tokenMisses: [...this.tokenMisses],
      samples: [...this.samples],
    };
  }
}
