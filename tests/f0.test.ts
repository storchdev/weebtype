import { expect, test } from "bun:test";
import { estimateF0 } from "../src/lib/core/f0.ts";

const saw = (hz: number, sr = 44100, n = 4096) =>
  Float32Array.from(
    { length: n },
    (_, i) => (((i * hz) / sr) % 1) - 0.5 + 0.3 * Math.sin((2 * Math.PI * i * hz * 3) / sr),
  );

test("finds the fundamental of harmonic-rich tones", () => {
  for (const hz of [110, 220, 392, 523.25]) {
    expect(Math.abs((estimateF0(saw(hz), 44100) as number) / hz - 1)).toBeLessThan(0.01);
  }
});

test("noise is not voiced", () => {
  let s = 7;
  const noise = Float32Array.from({ length: 4096 }, () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  });
  expect(estimateF0(noise, 44100)).toBeNull();
});
