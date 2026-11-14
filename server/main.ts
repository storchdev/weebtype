// weebtype server: JSON API + static frontend (dist/) on localhost.

import { join } from "node:path";
import { type Backend, type GenerateRequest, type HealthResponse, LEVELS } from "../src/lib/core/types.ts";
import { Dictionary } from "./dictionary.ts";
import { backendAvailable } from "./llm.ts";
import { PassageService } from "./passages.ts";
import { Tatoeba } from "./tatoeba.ts";

const PORT = Number(process.env.WEEBTYPE_PORT ?? 5174);
const DIST = join(import.meta.dir, "..", "dist");
const service = new PassageService();
let dictLoaded = false;

const dictReady = Dictionary.load()
  .then((d) => {
    if (!d) {
      console.warn("[dict] data/dictionary.json not found — run `bun run data:import <dir>` for hints.");
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
  if (backend !== "claude" && backend !== "codex") return "backend must be claude or codex";
  const level = LEVELS.find((l) => l === b.level);
  if (!level) return "invalid level";
  const length = Number(b.length);
  if (!Number.isFinite(length) || length < 10 || length > 2000) return "length must be 10..2000";
  return {
    backend: backend as Backend,
    model: typeof b.model === "string" ? b.model.slice(0, 100) : "",
    level,
    length: Math.round(length),
    topic: typeof b.topic === "string" ? b.topic.slice(0, 200) : "",
    dict: b.dict !== false,
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
    "/api/health": () =>
      Response.json({
        backends: { claude: backendAvailable("claude"), codex: backendAvailable("codex") },
        dictionary: dictLoaded,
        tatoeba: (service.tatoeba?.size ?? 0) > 0,
      } satisfies HealthResponse),
    "/api/passage": {
      POST: async (req) => {
        const r = await readRequest(req);
        if (r instanceof Response) return r;
        await dictReady;
        return Response.json(await service.get(r));
      },
    },
    "/api/prefetch": {
      POST: async (req) => {
        const r = await readRequest(req);
        if (r instanceof Response) return r;
        await dictReady;
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

const url = `http://localhost:${server.port}`;
console.log(`weebtype server on ${url}`);
if (process.argv.includes("--open")) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" });
}
