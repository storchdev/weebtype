import { expect, test } from "bun:test";
import { exportHistory, type HistoryEntry, mergeHistory, parseHistoryFile } from "../src/lib/history.ts";

const e = (at: number, kpm = 300): HistoryEntry => ({
  at,
  level: "N4",
  source: "claude",
  preview: "今日は",
  kpm,
  keysPerMin: kpm * 2,
  accuracy: 0.97,
  seconds: 20,
  kana: 100,
});

test("export → parse round-trips", () => {
  const list = [e(3), e(2), e(1)];
  expect(parseHistoryFile(exportHistory(list))).toEqual({ entries: list, invalid: 0 });
});

test("parse accepts a bare array and skips invalid rows", () => {
  const r = parseHistoryFile(JSON.stringify([e(1), { at: "x" }, null, { at: 5, kpm: 1, accuracy: 7 }]));
  expect(r.invalid).toBe(2);
  expect(r.entries.map((x) => x.at)).toEqual([1, 5]);
  expect(r.entries[1]?.accuracy).toBe(1);
});

test("parse rejects unrelated JSON", () => {
  expect(() => parseHistoryFile('{"hello": 1}')).toThrow();
  expect(() => parseHistoryFile("not json")).toThrow();
});

test("merge skips duplicates and keeps newest first", () => {
  const { list, added } = mergeHistory([e(5), e(1)], [e(1), e(3), e(3), e(9)]);
  expect(added).toBe(2);
  expect(list.map((x) => x.at)).toEqual([9, 5, 3, 1]);
});
