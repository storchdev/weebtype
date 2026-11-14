<script lang="ts">
import {
  clearHistory,
  exportHistory,
  type HistoryEntry,
  mergeHistory,
  parseHistoryFile,
  saveHistory,
} from "../history.ts";

interface Props {
  entries: HistoryEntry[];
  onchange: (entries: HistoryEntry[]) => void;
}
let { entries, onchange }: Props = $props();

let fileInput: HTMLInputElement | undefined = $state();
let status = $state("");
let statusError = $state(false);
let confirmClear = $state(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

function say(msg: string, error = false): void {
  status = msg;
  statusError = error;
}

function doExport(): void {
  const blob = new Blob([exportHistory(entries)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `weebtype-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say(`Exported ${entries.length} ${entries.length === 1 ? "test" : "tests"}.`);
}

async function doImport(e: Event): Promise<void> {
  const input = e.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const parsed = parseHistoryFile(await file.text());
    const { list, added } = mergeHistory(entries, parsed.entries);
    saveHistory(list);
    onchange(list);
    const dup = parsed.entries.length - added;
    const extra = [dup && `${dup} already here`, parsed.invalid && `${parsed.invalid} unreadable`].filter(
      Boolean,
    );
    say(
      `Imported ${added} ${added === 1 ? "test" : "tests"}${extra.length ? ` (${extra.join(", ")})` : ""}.`,
    );
  } catch (err) {
    say(`Couldn't import ${file.name}: ${err instanceof Error ? err.message : String(err)}`, true);
  }
}

function doClear(): void {
  if (!confirmClear) {
    confirmClear = true;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => (confirmClear = false), 3000);
    return;
  }
  confirmClear = false;
  clearHistory();
  onchange([]);
  say("History cleared.");
}

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
  <header>
    <h2>記録 <span>history</span></h2>
    <div class="tools">
      <button onclick={doExport} disabled={!entries.length}>export</button>
      <button onclick={() => fileInput?.click()}>import</button>
      <button class:danger={confirmClear} onclick={doClear} disabled={!entries.length}
        >{confirmClear ? "click again to clear" : "clear"}</button
      >
      <input type="file" accept="application/json,.json" hidden bind:this={fileInput} onchange={doImport} />
    </div>
  </header>
  {#if status}<p class="status" class:error={statusError}>{status}</p>{/if}
  {#if entries.length === 0}
    <p class="empty">No tests yet. Finish one and it'll show up here, or import an exported file.</p>
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
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 18px;
  }
  h2 {
    font-family: var(--title-font);
    font-weight: 600;
    font-size: 24px;
    margin: 0;
  }
  .tools {
    display: flex;
    gap: 4px;
    padding: 3px;
    border: 1px solid var(--faint);
    border-radius: 999px;
  }
  .tools button {
    background: none;
    border: none;
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 12.5px;
    color: var(--ink-soft);
    transition:
      background-color 0.2s,
      color 0.2s;
  }
  .tools button:hover:not(:disabled) {
    color: var(--ink);
    background: var(--faint);
  }
  .tools button:disabled {
    color: var(--muted);
    opacity: 0.5;
    cursor: default;
  }
  .tools button.danger {
    background: var(--accent);
    color: var(--paper-raised);
  }
  .status {
    margin: -6px 0 16px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .status.error {
    color: var(--accent);
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
</style>
