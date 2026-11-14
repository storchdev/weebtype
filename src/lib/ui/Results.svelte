<script lang="ts">
import type { Stats, TypingSession } from "../core/session.ts";

interface Props {
  stats: Stats;
  session: TypingSession;
  onnext: () => void;
  onretry: () => void;
}
let { stats, session, onnext, onretry }: Props = $props();

const W = 520;
const H = 90;

// Speed curve: kana/min over a sliding ~3 s window.
const curve = $derived.by(() => {
  const s = stats.samples;
  if (s.length < 3) return null;
  const pts: Array<[number, number]> = [];
  let j = 0;
  for (let i = 1; i < s.length; i++) {
    const [ti, ki] = s[i] as [number, number];
    while (j < i - 1 && ti - (s[j + 1] as [number, number])[0] >= 3) j++;
    const [tj, kj] = s[j] as [number, number];
    if (ti - tj < 0.5) continue;
    pts.push([ti, ((ki - kj) / (ti - tj)) * 60]);
  }
  if (pts.length < 2) return null;
  const tMax = stats.seconds || 1;
  const vMax = Math.max(...pts.map((p) => p[1])) * 1.1 || 1;
  const xs = pts.map(([t]) => (t / tMax) * W);
  const path = pts
    .map(([, v], i) => `${i ? "L" : "M"}${(xs[i] as number).toFixed(1)},${(H - (v / vMax) * H).toFixed(1)}`)
    .join(" ");
  const avgY = H - (stats.kpm / vMax) * H;
  const area = `${path} L${(xs[xs.length - 1] as number).toFixed(1)},${H} L${(xs[0] as number).toFixed(1)},${H} Z`;
  return { path, area, avgY, vMax };
});

const trouble = $derived(
  stats.tokenMisses
    .map((m, i) => ({ m, i }))
    .filter((x) => x.m > 0)
    .sort((a, b) => b.m - a.m)
    .slice(0, 6)
    .map(({ m, i }) => ({
      misses: m,
      surface: session.passage.tokens[i]?.groups.map((g) => g.t).join("") ?? "",
      reading: session.reading(i),
      romaji: session.guide(i).typed,
    })),
);

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, "0")}` : `${s.toFixed(1)}s`;
}
</script>

<section class="results">
  <div class="headline">
    <div class="big">
      <span class="num">{Math.round(stats.kpm)}</span>
      <span class="unit">字/分<small>kana per minute</small></span>
    </div>
    <dl class="grid">
      <div>
        <dt>accuracy</dt>
        <dd>{(stats.accuracy * 100).toFixed(1)}%</dd>
      </div>
      <div>
        <dt>keys/min</dt>
        <dd>{Math.round(stats.keysPerMin)}</dd>
      </div>
      <div>
        <dt>time</dt>
        <dd>{fmtTime(stats.seconds)}</dd>
      </div>
      <div>
        <dt>misses</dt>
        <dd>{stats.misses}</dd>
      </div>
    </dl>
  </div>

  {#if curve}
    <svg class="chart" viewBox="0 -6 {W} {H + 12}" preserveAspectRatio="none" aria-label="Speed over time">
      <path class="area" d={curve.area} />
      <line class="avg" x1="0" x2={W} y1={curve.avgY} y2={curve.avgY} />
      <path class="line" d={curve.path} />
    </svg>
  {/if}

  {#if session.passage.translation}
    <p class="translation">{session.passage.translation}</p>
  {/if}

  {#if trouble.length}
    <div class="trouble">
      <h3>つまずいた言葉 <span>tricky words</span></h3>
      <ul>
        {#each trouble as t}
          <li>
            <span class="t-surface">{t.surface}</span>
            {#if t.reading !== t.surface}<span class="t-reading">{t.reading}</span>{/if}
            <span class="t-romaji">{t.romaji}</span>
            <span class="t-miss">×{t.misses}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="actions">
    <button class="primary" onclick={onnext}>次へ <kbd>Enter</kbd></button>
    <button onclick={onretry}>もう一度 <kbd>Tab</kbd></button>
  </div>
</section>

<style>
  .results {
    animation: rise 0.5s var(--ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
  .headline {
    display: flex;
    align-items: flex-end;
    gap: 48px;
    flex-wrap: wrap;
  }
  .big {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .num {
    font-family: var(--title-font);
    font-size: 84px;
    line-height: 1;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .unit {
    display: flex;
    flex-direction: column;
    font-size: 18px;
    color: var(--ink-soft);
  }
  .unit small {
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.06em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 4px 32px;
    margin: 0 0 8px;
  }
  dt {
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  dd {
    margin: 0;
    font-size: 22px;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .chart {
    display: block;
    width: 100%;
    height: 96px;
    margin: 28px 0 8px;
    overflow: visible;
  }
  .chart .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }
  .chart .area {
    fill: var(--accent-soft);
  }
  .chart .avg {
    stroke: var(--muted);
    stroke-dasharray: 3 4;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .translation {
    color: var(--ink-soft);
    font-style: italic;
    margin: 20px 0 0;
    max-width: 70ch;
  }
  .trouble h3 {
    font-family: var(--title-font);
    font-weight: 600;
    font-size: 15px;
    margin: 24px 0 8px;
    color: var(--ink-soft);
  }
  .trouble h3 span {
    font-family: var(--ui-font);
    font-weight: 400;
    font-size: 11px;
    color: var(--muted);
    margin-left: 6px;
  }
  .trouble ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .trouble li {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 4px 10px;
    border: 1px solid var(--faint);
    border-radius: 999px;
  }
  .t-surface {
    font-size: 17px;
  }
  .t-reading {
    color: var(--muted);
    font-size: 12px;
  }
  .t-romaji {
    font-family: "M PLUS 1 Code", monospace;
    color: var(--muted);
    font-size: 12px;
  }
  .t-miss {
    color: var(--accent);
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 12px;
    margin-top: 32px;
  }
  .actions button {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid var(--faint);
    background: transparent;
    transition:
      background-color 0.2s,
      border-color 0.2s,
      transform 0.15s var(--ease-out);
  }
  .actions button:hover {
    border-color: var(--muted);
    transform: translateY(-1px);
  }
  .actions .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--paper-raised);
  }
  .actions .primary kbd {
    color: inherit;
    border-color: color-mix(in srgb, var(--paper-raised) 50%, transparent);
  }
</style>
