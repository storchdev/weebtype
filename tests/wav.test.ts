import { expect, test } from "bun:test";
import { encodeWav } from "../src/lib/core/wav.ts";

test("encodes a 16-bit mono WAV", async () => {
  const blob = encodeWav(new Float32Array([0, 1, -1, 2]), 44100);
  const v = new DataView(await blob.arrayBuffer());
  const str = (at: number, n: number) =>
    String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(at + i)));
  expect(blob.size).toBe(44 + 8);
  expect(blob.type).toBe("audio/wav");
  expect(str(0, 4)).toBe("RIFF");
  expect(str(8, 4)).toBe("WAVE");
  expect(v.getUint32(24, true)).toBe(44100);
  expect(v.getUint16(34, true)).toBe(16);
  expect(v.getUint32(40, true)).toBe(8);
  expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767]);
});
