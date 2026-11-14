import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassageService } from "../server/passages.ts";
import type { GenerateRequest, Passage } from "../src/lib/core/types.ts";

// Unreachable endpoints, so the refill prefetch fails fast instead of hitting a real server.
const req: GenerateRequest = {
  backend: "llama",
  model: "",
  endpoint: "http://127.0.0.1:1",
  level: "N4",
  length: 50,
  topic: "",
};
const passage: Passage = {
  id: "p1",
  source: "llama",
  level: "N4",
  tokens: [{ groups: [{ t: "猫", r: "ねこ" }] }],
};

test("unused passages survive a restart and are served first", async () => {
  const dir = await mkdtemp(join(tmpdir(), "weebtype-cache-"));
  try {
    const file = join(dir, "cache", "passages.json");
    const key = JSON.stringify(["llama", "", "N4", 50, "", "http://127.0.0.1:1"]);
    await Bun.write(file, JSON.stringify({ v: 1, ready: { [key]: [passage, { junk: true }] } }));
    const svc = new PassageService(file);
    expect(await svc.loadCache()).toBe(1);
    expect(svc.status({ ...req, endpoint: "http://127.0.0.1:1/" }).ready).toBe(1);
    // Serving it removes it from the cache file (the refill prefetch fails offline, harmlessly).
    const res = await svc.get({ ...req, endpoint: "http://127.0.0.1:2" });
    expect(res.passage.id).not.toBe("p1"); // different endpoint → different key
    const served = await svc.get(req);
    expect(served.passage.id).toBe("p1");
    // Served but not typed yet: still on disk.
    await svc.flush();
    const saved = async () =>
      ((await Bun.file(file).json()) as { ready: Record<string, { id: string }[]> }).ready[key]?.map(
        (p) => p.id,
      );
    expect(await saved()).toEqual(["p1"]);
    // Typing started: gone.
    svc.consume("p1");
    await svc.flush();
    expect(await saved()).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);

test("untyped passages go back to the cache; skipped ones aren't reshown this run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "weebtype-cache-"));
  try {
    const file = join(dir, "passages.json");
    const key = JSON.stringify(["llama", "", "N4", 50, "", "http://127.0.0.1:1"]);
    const p2 = { ...passage, id: "p2" };
    await Bun.write(file, JSON.stringify({ v: 1, ready: { [key]: [passage, p2] } }));
    const svc = new PassageService(file);
    await svc.loadCache();

    // Tab closed / settings changed: back to the front of the queue.
    expect((await svc.get(req)).passage.id).toBe("p1");
    svc.release("p1", false);
    expect((await svc.get(req)).passage.id).toBe("p1");

    // Skipped: the next one is different, and p1 isn't served again while p2 is ready.
    svc.release("p1", true);
    expect((await svc.get(req)).passage.id).toBe("p2");
    expect(svc.status(req).ready).toBe(0);

    // …but it's still cached, so it comes back after a restart.
    await svc.flush();
    const again = new PassageService(file);
    expect(await again.loadCache()).toBe(2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
