// Fundamental-frequency estimate for a voiced stretch of a sample (normalised
// autocorrelation). Used to pitch-shift voicebank samples onto the accent melody.

/** Estimated f0 in Hz of `x` (≥ ~3 periods long), or null when it isn't clearly voiced. */
export function estimateF0(x: Float32Array, sampleRate: number, minHz = 70, maxHz = 1100): number | null {
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.ceil(sampleRate / minHz), Math.floor(x.length / 2));
  if (maxLag <= minLag) return null;
  const n = x.length - maxLag;
  const r: number[] = [];
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0;
    let e0 = 0;
    let e1 = 0;
    for (let i = 0; i < n; i++) {
      const a = x[i] as number;
      const b = x[i + lag] as number;
      num += a * b;
      e0 += a * a;
      e1 += b * b;
    }
    const v = e0 > 0 && e1 > 0 ? num / Math.sqrt(e0 * e1) : 0;
    r.push(v);
    if (v > best) best = v;
  }
  if (best < 0.5) return null;
  // the first peak close to the best avoids picking a sub-harmonic (an octave too low)
  for (let i = 1; i < r.length - 1; i++) {
    const v = r[i] as number;
    if (v >= best * 0.9 && v >= (r[i - 1] as number) && v >= (r[i + 1] as number)) {
      // parabolic interpolation around the peak
      const a = r[i - 1] as number;
      const c = r[i + 1] as number;
      const d = a - 2 * v + c;
      const shift = d !== 0 ? (0.5 * (a - c)) / d : 0;
      return sampleRate / (minLag + i + shift);
    }
  }
  return null;
}
