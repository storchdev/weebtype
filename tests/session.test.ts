import { expect, test } from "bun:test";
import { TypingSession } from "../src/lib/core/session.ts";
import type { Passage } from "../src/lib/core/types.ts";

const passage: Passage = {
  id: "t",
  source: "builtin",
  level: "N5",
  tokens: [
    {
      groups: [
        { t: "食", r: "た" },
        { t: "べる", r: "べる" },
      ],
    },
    { groups: [{ t: "。", r: "。" }] },
  ],
};

test("groups complete as their reading is typed", () => {
  const s = new TypingSession(passage);
  expect(s.target).toBe("たべる。");
  let now = 0;
  const tick = () => {
    now += 100;
    return now;
  };
  const type = (keys: string) => {
    for (const k of keys) s.press(k, tick());
  };
  type("t");
  expect(s.snapshot()).toMatchObject({ group: 0, token: 0, buffer: "t", pendingKana: "" });
  type("a");
  expect(s.snapshot()).toMatchObject({ group: 1, token: 0, buffer: "", pendingKana: "" });
  type("be");
  expect(s.snapshot()).toMatchObject({ group: 1, pendingKana: "べ" });
  expect(s.press("x", tick())).toBe(false);
  type("ru");
  expect(s.snapshot()).toMatchObject({ group: 2, token: 1 });
  type(".");
  const snap = s.snapshot();
  expect(snap.finished).toBe(true);
  const st = s.stats();
  expect(st.kana).toBe(3);
  expect(st.misses).toBe(1);
  expect(st.tokenMisses).toEqual([1, 0]);
  expect(st.accuracy).toBeCloseTo(7 / 8);
});

test("guide covers a token", () => {
  const s = new TypingSession(passage);
  expect(s.guide(0)).toEqual({ typed: "", rest: "taberu" });
  expect(s.reading(0)).toBe("たべる");
});
