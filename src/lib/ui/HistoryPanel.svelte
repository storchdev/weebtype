<script lang="ts">
import { clearHistory, type HistoryEntry } from "../history.ts";

interface Props {
  entries: HistoryEntry[];
  onclear: () => void;
}
let { entries, onclear }: Props = $props();

const W = 520;
const H = 80;
const recent = $derived(entries.slice(0, 50).reverse());
const best = $derived(entries.reduce((m, e) => Math.max(m, e.kpm), 0));
const avg10 = $derived(
  entries.length ? entries.slice(0, 10).reduce((s, e) => s + e.kpm, 0) / Math.min(10, entries.length) : 0,
);
const avgAcc = $derived(
  entries.length
    ? entries.slice(0, 10).reduce((s, e) => s + e.accuracy, 0) / Math.min(10, entries.length)
    : 0,
);
const path = $derived.by(() => {
  if (recent.length < 2) return "";
  const max = Math.max(...recent.map((e) => e.kpm)) * 1.1 || 1;
  return recent
    .map(
      (e, i) =>
        `${i ? "L" : "M"}${((i / (recent.length - 1)) * W).toFixed(1)},${(H - (e.kpm / max) * H).toFixed(1)}`,
    )
    .join(" ");
});

function when(t: number): string {
  return new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<section class="history">
  <h2>記録 <span>history</span></h2>
  {#if entries.length === 0}
    <p class="empty">No tests yet. Finish one and it'll show up here.</p>
  {:else}
    <dl class="summary">
      <div><dt>best</dt><dd>{Math.round(best)}<small>字/分</small></dd></div>
      <div><dt>last 10 avg</dt><dd>{Math.round(avg10)}<small>字/分</small></dd></div>
      <div><dt>last 10 accuracy</dt><dd>{(avgAcc * 100).toFixed(1)}<small>%</small></dd></div>
      <div><dt>tests</dt><dd>{entries.length}</dd></div>
    </dl>
    {#if path}
      <svg viewBox="0 -4 {W} {H + 8}" preserveAspectRatio="none" class="chart" aria-label="Kana per minute, recent tests">
        <path d={path} />
      </svg>
    {/if}
    <ol class="list">
      {#each entries.slice(0, 40) as e}
        <li>
          <span class="kpm">{Math.round(e.kpm)}</span>
          <span class="acc">{(e.accuracy * 100).toFixed(0)}%</span>
          <span class="lvl">{e.level}</span>
          <span class="prev">{e.preview}</span>
          <span class="when">{when(e.at)}</span>
        </li>
      {/each}
    </ol>
    <button
      class="clear"
      onclick={() => {
        if (confirm("Clear all history?")) {
          clearHistory();
          onclear();
        }
      }}>clear history</button
    >
  {/if}
</section>

<style>
  .history {
    animation: rise 0.45s var(--ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
  h2 {
    font-family: var(--title-font);
    font-weight: 600;
    font-size: 24px;
    margin: 0 0 18px;
  }
  h2 span {
    font-family: var(--ui-font);
    font-weight: 400;
    font-size: 11px;
    color: var(--muted);
    margin-left: 6px;
  }
  .empty {
    color: var(--muted);
  }
  .summary {
    display: flex;
    gap: 40px;
    margin: 0;
    flex-wrap: wrap;
  }
  dt {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  dd {
    margin: 0;
    font-size: 26px;
    font-variant-numeric: tabular-nums;
  }
  dd small {
    font-size: 12px;
    color: var(--muted);
    margin-left: 3px;
  }
  .chart {
    display: block;
    width: 100%;
    height: 80px;
    margin: 20px 0;
  }
  .chart path {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 38vh;
    overflow-y: auto;
  }
  .list li {
    display: grid;
    grid-template-columns: 48px 44px 52px 1fr auto;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid var(--faint);
    font-size: 13px;
    align-items: baseline;
  }
  .kpm {
    color: var(--accent);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }
  .acc,
  .lvl,
  .when {
    color: var(--muted);
  }
  .prev {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--ink-soft);
  }
  .clear {
    margin-top: 16px;
    background: none;
    border: none;
    color: var(--muted);
    font-size: 12px;
    text-decoration: underline;
  }
</style>
