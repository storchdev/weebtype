// Round axis ticks for small charts (the results speed curve).

export interface Axis {
  /** Top of the axis: `max` rounded up to a whole step. */
  top: number;
  /** Tick values from 0 to `top`, ascending. */
  ticks: number[];
}

/**
 * Ticks at a round step (1, 2, 2.5 or 5 × 10ⁿ) from 0, with at most `maxTicks` intervals
 * and the top tick at or above `max`, so the data never goes past the highest label.
 */
export function niceAxis(max: number, maxTicks = 3): Axis {
  if (!(max > 0) || !Number.isFinite(max)) return { top: 1, ticks: [0, 1] };
  const raw = max / maxTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag) as number;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  // Rounding keeps 0.1 + 0.2-style float noise out of the labels.
  for (let i = 0; i * step <= top + step * 1e-9; i++) ticks.push(Number((i * step).toPrecision(12)));
  return { top: Number(top.toPrecision(12)), ticks };
}
