// weebtype server: JSON API + static frontend (dist/) on localhost.

import { join } from "node:path";
import { type Backend, type GenerateRequest, type HealthResponse, LEVELS } from "../src/lib/core/types.ts";
import { DATA_DIR, Dictionary } from "./dictionary.ts";
import { backendAvailable, DEFAULT_LLAMA_URL } from "./llm.ts";
import { PassageService } from "./passages.ts";
import { Tatoeba } from "./tatoeba.ts";
import { loadVoicebank, samplePath } from "./voicebank.ts";

// 6494 = おうよう (応用, "application") typed on the JIS kana number row (お6 う4 よ9 う4)
const PORT = Number(process.env.WEEBTYPE_PORT ?? 6494);
const DIST = join(import.meta.dir, "..", "dist");
// Generated-but-unused passages persist here (data/ is gitignored) and are served first next run.
const service = new PassageService(join(DATA_DIR, "cache", "passages.json"));
const cacheReady = service.loadCache().then((n) => {
  if (n) console.log(`[passages] ${n} unused passage(s) restored from cache`);
});
let dictLoaded = false;

const dictReady = Dictionary.load()
  .then((d) => {
    if (!d) {
      console.warn("[dict] data/dictionary.json not found — run `bun run data:setup` for hints.");
      return;
    }
    service.dict = d;
    service.tatoeba = new Tatoeba(d.rawExamples);
    dictLoaded = true;
    console.log(`[dict] loaded; ${service.tatoeba.size} fallback sentences`);
  })
  .catch((e: unknown) => console.error("[dict] failed to load", e));

function parseRequest(body: unknown): GenerateRequest | string {
  if (typeof body !== "object" || body === null) return "body must be an object";
  const b = body as Record<string, unknown>;
  const backend = b.backend;
  if (backend !== "claude" && backend !== "codex" && backend !== "llama")
    return "backend must be claude, codex or llama";
  const endpoint = typeof b.endpoint === "string" ? b.endpoint.trim().slice(0, 300) : "";
  if (endpoint && !/^https?:\/\/[^\s]+$/.test(endpoint)) return "endpoint must be an http(s) URL";
  const level = LEVELS.find((l) => l === b.level);
  if (!level) return "invalid level";
  const length = Number(b.length);
  if (!Number.isFinite(length) || length < 10 || length > 2000) return "length must be 10..2000";
  return {
    backend: backend as Backend,
    model: typeof b.model === "string" ? b.model.slice(0, 100) : "",
    ...(endpoint ? { endpoint } : {}),
    level,
    length: Math.round(length),
    topic: typeof b.topic === "string" ? b.topic.slice(0, 200) : "",
  };
}

async function readRequest(req: Request): Promise<GenerateRequest | Response> {
  const parsed = parseRequest(await req.json().catch(() => null));
  return typeof parsed === "string" ? Response.json({ error: parsed }, { status: 400 }) : parsed;
}

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  idleTimeout: 255,
  routes: {
    // `?llama=<url>` checks that llama-server instead of the default one.
    "/api/health": async (req) => {
      const llama = new URL(req.url).searchParams.get("llama")?.trim();
      const endpoint =
        llama && /^https?:\/\/[^\s]+$/.test(llama) ? llama.replace(/\/+$/, "") : DEFAULT_LLAMA_URL;
      return Response.json({
        backends: {
          claude: await backendAvailable("claude"),
          codex: await backendAvailable("codex"),
          llama: await backendAvailable("llama", endpoint),
        },
        dictionary: dictLoaded,
        tatoeba: (service.tatoeba?.size ?? 0) > 0,
      } satisfies HealthResponse);
    },
    // Optional UTAU voicebank in data/voice/ (rescanned per call; the client asks once per load).
    "/api/voice": async () => Response.json({ bank: await loadVoicebank() }),
    "/api/voice/sample": async (req) => {
      const p = samplePath(new URL(req.url).searchParams.get("p") ?? "");
      const f = p ? Bun.file(p) : null;
      return f && (await f.exists()) ? new Response(f) : new Response("not found", { status: 404 });
    },
    "/api/passage": {
      POST: async (req) => {
        const r = await readRequest(req);
        if (r instanceof Response) return r;
        await dictReady;
        await cacheReady;
        return Response.json(await service.get(r));
      },
    },
    "/api/prefetch": {
      POST: async (req) => {
        const r = await readRequest(req);
        if (r instanceof Response) return r;
        await dictReady;
        await cacheReady;
        service.prefetch(r);
        return Response.json(service.status(r));
      },
    },
    "/api/fallback": {
      POST: async (req) => {
        const r = await readRequest(req);
        if (r instanceof Response) return r;
        await dictReady;
        return Response.json({ passage: service.fallback(r) });
      },
    },
  },
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return Response.json({ error: "not found" }, { status: 404 });
    const path = join(DIST, decodeURIComponent(url.pathname));
    if (path.startsWith(DIST)) {
      const f = Bun.file(path);
      if (url.pathname !== "/" && (await f.exists())) return new Response(f);
    }
    const index = Bun.file(join(DIST, "index.html"));
    if (await index.exists()) return new Response(index);
    return new Response("Frontend not built. Run `bun start` (or `bun dev` for development).", {
      status: 404,
    });
  },
});

const url = `http://127.0.0.1:${server.port}`;
console.log(`weebtype server on ${url}`);
if (process.argv.includes("--open")) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" });
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void service.flush().finally(() => process.exit(0));
  });
}
