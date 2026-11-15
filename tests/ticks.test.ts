import { describe, expect, test } from "bun:test";
import { niceAxis } from "../src/lib/core/ticks.ts";

describe("niceAxis", () => {
  test("typing speeds get round steps with the top at or above the max", () => {
    expect(niceAxis(287)).toEqual({ top: 300, ticks: [0, 100, 200, 300] });
    expect(niceAxis(132)).toEqual({ top: 150, ticks: [0, 50, 100, 150] });
    expect(niceAxis(410)).toEqual({ top: 600, ticks: [0, 200, 400, 600] });
  });

  test("never more than maxTicks intervals", () => {
    for (const max of [1, 7, 33, 99, 101, 640, 999, 1234]) {
      const { ticks, top } = niceAxis(max);
      expect(ticks.length - 1).toBeLessThanOrEqual(3);
      expect(top).toBeGreaterThanOrEqual(max);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBe(top);
    }
  });

  test("exact multiples don't add an extra step", () => {
    expect(niceAxis(200)).toEqual({ top: 200, ticks: [0, 100, 200] });
  });

  test("degenerate input falls back to 0..1", () => {
    expect(niceAxis(0)).toEqual({ top: 1, ticks: [0, 1] });
    expect(niceAxis(Number.NaN)).toEqual({ top: 1, ticks: [0, 1] });
  });
});
