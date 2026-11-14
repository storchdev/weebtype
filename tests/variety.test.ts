import { expect, test } from "bun:test";
import { buildPrompt } from "../server/llm.ts";
import { Variety } from "../server/variety.ts";

test("subjects don't repeat within a long run", () => {
  const v = new Variety();
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(v.next().subject);
  expect(seen.size).toBe(100);
});

function lcg(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

test("two instances with different rng streams diverge", () => {
  const va = new Variety(lcg(1));
  const vb = new Variety(lcg(2));
  const sa = Array.from({ length: 5 }, () => va.next().subject);
  const sb = Array.from({ length: 5 }, () => vb.next().subject);
  expect(sa).not.toEqual(sb);
});

test("prompt carries the direction and recent passages", () => {
  const v = new Variety();
  const d1 = v.next();
  expect(v.promptLines(d1, "").join("\n")).not.toContain("Recent passages");
  v.record(d1, "駅で傘をなくした。困った。");
  const d2 = v.next();
  const p = buildPrompt("N4", 100, v.promptLines(d2, ""));
  expect(p).toContain(`Subject: ${d2.subject}`);
  expect(p).toContain(`subject: ${d1.subject}`);
  expect(p).toContain("opened with: 駅で傘をなくした。");
  expect(p).not.toContain("seed");
});

test("user topic is kept and given an angle", () => {
  const v = new Variety();
  const d = v.next();
  expect(v.promptLines(d, " 料理 ")[0]).toStartWith("Topic: 料理.");
});
