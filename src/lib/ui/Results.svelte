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
  const t0 = pts[0]?.[0] ?? 0;
  const xs = pts.map(([t]) => ((t - t0) / (tMax - t0 || 1)) * W);
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

// The passage as words, with how often each one was missed (for the review column).
const review = $derived(
  session.passage.tokens.map((t, i) => ({
    text: t.groups.map((g) => g.t).join(""),
    reading: session.reading(i),
    misses: stats.tokenMisses[i] ?? 0,
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
    <figure class="figure">
      <svg class="chart" viewBox="0 -6 {W} {H + 6}" preserveAspectRatio="none" aria-label="Speed over time">
        <defs>
          <linearGradient id="speed-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style="stop-color: var(--accent)" stop-opacity="0.22" />
            <stop offset="1" style="stop-color: var(--accent)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path class="area" d={curve.area} />
        <line class="avg" x1="0" x2={W} y1={curve.avgY} y2={curve.avgY} />
        <path class="line" d={curve.path} />
      </svg>
      <figcaption class="axis">
        <span>0s</span>
        <span class="avg-label"><i></i>average {Math.round(stats.kpm)} 字/分</span>
        <span>{fmtTime(stats.seconds)}</span>
      </figcaption>
    </figure>
  {/if}

  <div class="detail">
    <div class="col">
      <h3 class="label">passage <span>文章</span></h3>
      <p class="passage">
        {#each review as w}{#if w.misses}<span class="missed" title="{w.reading} · ×{w.misses}">{w.text}</span
            >{:else}{w.text}{/if}{/each}
      </p>
      {#if session.passage.translation}
        <p class="translation">{session.passage.translation}</p>
      {/if}
    </div>
    <div class="col side">
      <h3 class="label">tricky words <span>つまずき</span></h3>
      {#if trouble.length}
        <ol class="trouble">
          {#each trouble as t}
            <li>
              <span class="t-surface">{t.surface}</span>
              <span class="t-reading">{t.reading !== t.surface ? t.reading : ""}</span>
              <span class="t-romaji">{t.romaji}</span>
              <span class="t-miss">×{t.misses}</span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="clean">No misses — 全部正解.</p>
      {/if}
    </div>
  </div>

  <div class="actions">
    <button class="pbtn" onclick={onnext}>次へ <span>next</span><kbd>Enter</kbd></button>
    <button class="tbtn" onclick={onretry}>もう一度 <span>retry</span><kbd>Tab</kbd></button>
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
  .figure {
    margin: 32px 0 0;
  }
  .chart {
    display: block;
    width: 100%;
    height: 88px;
    overflow: visible;
  }
  .chart .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.75;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }
  .chart .area {
    fill: url(#speed-fill);
  }
  .chart .avg {
    stroke: var(--muted);
    stroke-dasharray: 3 4;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--faint);
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .avg-label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .avg-label i {
    width: 14px;
    border-top: 1px dashed var(--muted);
  }

  .detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
    gap: 0 40px;
    margin-top: 28px;
  }
  .side {
    border-left: 1px solid var(--faint);
    padding-left: 28px;
  }
  .label {
    margin: 0 0 10px;
    font-family: var(--ui-font);
    font-weight: 400;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .label span {
    margin-left: 6px;
    letter-spacing: 0.04em;
  }
  .passage {
    margin: 0;
    font-size: 16px;
    line-height: 1.9;
    color: var(--ink-soft);
  }
  .missed {
    color: var(--accent);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 5px;
  }
  .translation {
    margin: 8px 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted);
  }
  .trouble {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .trouble li {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: baseline;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid var(--faint);
  }
  .trouble li:first-child {
    padding-top: 0;
  }
  .t-surface {
    font-size: 16px;
    color: var(--ink);
  }
  .t-reading {
    font-size: 12px;
    color: var(--muted);
  }
  .t-romaji {
    font-family: "M PLUS 1 Code", monospace;
    font-size: 12px;
    color: var(--muted);
  }
  .t-miss {
    min-width: 2.2em;
    text-align: right;
    font-size: 12px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .clean {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 24px;
    margin-top: 32px;
  }
  .actions button span {
    font-size: 11px;
    opacity: 0.7;
  }
  .actions .tbtn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  @media (max-width: 720px) {
    .detail {
      grid-template-columns: 1fr;
      gap: 24px;
    }
    .side {
      border-left: none;
      padding-left: 0;
    }
  }
</style>
