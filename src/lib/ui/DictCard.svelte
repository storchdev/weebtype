<script lang="ts">
import { pitchMorae } from "../core/pitch.ts";
import type { DictEntry } from "../core/types.ts";

interface Props {
  entries: DictEntry[];
  surface: string;
  width?: number;
}

let { entries, surface, width = $bindable(0) }: Props = $props();

const entry = $derived(entries[0]);
// Other senses of the *same* word only; homophones written differently are noise here.
const others = $derived(
  entries.slice(1, 3).filter((o) => entry && (o.term === entry.term || o.term === surface)),
);
</script>

{#if entry}
  <div class="card" bind:clientWidth={width}>
    <div class="head">
      <span class="term">{entry.term}</span>
      {#if entry.pitch !== null}
        <span class="pitch" title="pitch accent [{entry.pitch}]">
          {#each pitchMorae(entry.reading, entry.pitch) as m}
            <span class="mora" class:high={m.high} class:drop={m.drop}>{m.text}</span>
          {/each}
        </span>
      {:else if entry.reading !== entry.term}
        <span class="plain-reading">{entry.reading}</span>
      {/if}
      {#if entry.deinflectedFrom}
        <span class="deinflect">← {entry.deinflectedFrom}</span>
      {/if}
      {#if entry.tags.length}
        <span class="tags">{entry.tags.slice(0, 2).join(" · ")}</span>
      {/if}
    </div>
    <ol class="defs">
      {#each entry.defs.slice(0, 3) as d}
        <li>{d}</li>
      {/each}
    </ol>
    {#if entry.example}
      <div class="example">
        <div class="ex-jp">
          {#each entry.example.j as seg}{#if seg.r}<ruby class:kw={seg.k}>{seg.t}<rt>{seg.r}</rt></ruby
              >{:else}<span class:kw={seg.k}>{seg.t}</span>{/if}{/each}
        </div>
        <div class="ex-en">{entry.example.t}</div>
      </div>
    {/if}
    {#if others.length}
      <div class="others">
        {#each others as o}
          <span>【{o.reading}】{o.defs.slice(0, 2).join("; ")}</span>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .card {
    font-family: var(--ui-font);
    font-size: 13px;
    line-height: 1.45;
    color: var(--ink-soft);
    background: color-mix(in srgb, var(--paper-raised) 92%, transparent);
    border: 1px solid var(--faint);
    border-radius: var(--radius);
    padding: 8px 12px 10px;
    box-shadow: var(--shadow);
    width: max-content;
    max-width: 360px;
  }
  .head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 2px 8px;
  }
  .term {
    font-size: 16px;
    font-weight: 500;
    color: var(--ink);
  }
  .plain-reading {
    color: var(--muted);
  }
  .deinflect {
    font-size: 11px;
    color: var(--accent);
  }
  .tags {
    font-size: 11px;
    color: var(--muted);
  }
  .pitch {
    display: inline-block;
  }
  .mora {
    position: relative;
    display: inline-block;
    padding-top: 0.2em;
    color: var(--muted);
  }
  .mora.high {
    color: var(--ink-soft);
  }
  .mora.high::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 0.4em;
    border-top: 1.5px solid var(--ink-soft);
  }
  .mora.drop {
    margin-right: 0.12em;
    padding-right: 0.12em;
  }
  .mora.high.drop::before {
    right: -0.12em;
    border-right: 1.5px solid var(--ink-soft);
  }
  .defs {
    margin: 3px 0 0;
    padding-left: 18px;
  }
  .defs li::marker {
    color: var(--muted);
    font-size: 11px;
  }
  .example {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--faint);
    font-size: 12px;
  }
  .ex-jp {
    color: var(--ink-soft);
  }
  .ex-jp rt {
    font-size: 0.6em;
    color: var(--muted);
  }
  .kw {
    color: var(--accent);
  }
  .ex-en {
    color: var(--muted);
    font-size: 11.5px;
  }
  .others {
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    font-size: 11.5px;
    color: var(--muted);
  }
  .others span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 336px;
  }
</style>
