import type { GenerateRequest, HealthResponse, Passage, PassageResponse } from "./core/types.ts";
import { currentModel, type Settings } from "./settings.svelte.ts";

export function requestFor(s: Settings): GenerateRequest {
  return {
    // the Tatoeba-only mode never sends a generate request; the field just needs a value
    backend: s.backend === "tatoeba" ? "claude" : s.backend,
    model: currentModel(s),
    ...(s.backend === "llama" && s.llamaUrl.trim() ? { endpoint: s.llamaUrl.trim() } : {}),
    level: s.level,
    length: s.length,
    topic: s.topic,
  };
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export function fetchPassage(req: GenerateRequest, signal?: AbortSignal): Promise<PassageResponse> {
  return post("/api/passage", req, signal);
}

export async function fetchFallback(req: GenerateRequest): Promise<Passage> {
  return (await post<{ passage: Passage }>("/api/fallback", req)).passage;
}

/** Typing started on this passage: the server may drop it from its cache. */
export function consumePassage(id: string): void {
  post("/api/passage/consume", { id }).catch(() => {});
}

/**
 * Leaving this passage untyped: the server keeps it. `skipped` = the user asked for another
 * one. Uses sendBeacon so it still goes out while the page is closing.
 */
export function releasePassage(id: string, skipped: boolean): void {
  navigator.sendBeacon("/api/passage/release", JSON.stringify({ id, skipped }));
}

export function prefetch(req: GenerateRequest): void {
  post("/api/prefetch", req).catch(() => {});
}

/** `llamaUrl`: the llama-server to check (the server's default when empty). */
export async function fetchHealth(llamaUrl = ""): Promise<HealthResponse | null> {
  try {
    const q = llamaUrl.trim() ? `?llama=${encodeURIComponent(llamaUrl.trim())}` : "";
    const res = await fetch(`/api/health${q}`);
    return res.ok ? ((await res.json()) as HealthResponse) : null;
  } catch {
    return null;
  }
}
