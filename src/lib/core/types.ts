// Types shared between the browser and the Bun server.

export const LEVELS = ["N5", "N4", "N3", "N2", "N1", "native"] as const;
export type Level = (typeof LEVELS)[number];

export type Backend = "claude" | "codex";
export type PassageSource = Backend | "tatoeba" | "builtin";

/** A run of text plus the kana the user types to produce it, e.g. {t:"食", r:"た"}. */
export interface RubyGroup {
  t: string;
  r: string;
}

export interface ExampleSegment {
  t: string;
  r?: string;
  k?: boolean;
}

export interface DictExample {
  j: ExampleSegment[];
  t: string;
}

export interface DictEntry {
  term: string;
  reading: string;
  /** Downstep position, or null when unknown. */
  pitch: number | null;
  tags: string[];
  defs: string[];
  example: DictExample | null;
  /** Surface form if the entry was found by deinflecting it. */
  deinflectedFrom: string | null;
}

export interface Token {
  groups: RubyGroup[];
  dict?: DictEntry[];
}

export interface Passage {
  id: string;
  source: PassageSource;
  level: Level;
  topic?: string;
  translation?: string;
  tokens: Token[];
}

export interface GenerateRequest {
  backend: Backend;
  model: string;
  level: Level;
  /** Approximate number of kana to type. */
  length: number;
  topic: string;
  /** Whether to include dictionary annotations. */
  dict: boolean;
}

export interface HealthResponse {
  backends: Record<Backend, boolean>;
  dictionary: boolean;
  tatoeba: boolean;
}

export interface PassageResponse {
  passage: Passage;
  /** Set when the LLM failed and a fallback was served. */
  warning?: string;
}
