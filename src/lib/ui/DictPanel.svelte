<script lang="ts">
// Dictionary entry for the current word, set like a printed dictionary line below the
// text: a hairline rule with a marker that slides to point at the current word,
// headword on the left, senses + example on the right.
import { pitchMorae } from "../core/pitch.ts";
import type { DictEntry } from "../core/types.ts";

interface Props {
  entries: DictEntry[] | undefined;
  surface: string;
  /** x of the current word relative to the panel, for the marker. */
  markerX: number;
  tokenKey: number;
}

let { entries, surface, markerX, tokenKey }: Props = $props();

const entry = $derived(entries?.[0]);
// Other senses of the *same* word only; homophones written differently are noise here.
const others = $derived(
  (entries ?? []).slice(1, 3).filter((o) => entry && (o.term === entry.term || o.term === surface)),
);
</script>

<div class="panel">
  <div class="rule">
    <div class="marker" style="transform: translate3d({Math.max(0, markerX)}px, 0, 0)"></div>
  </div>
  {#key tokenKey}
    <div class="body">
      {#if entry}
        <div class="head">
          <div class="reading">
            {#if entry.pitch !== null}
              <span class="pitch" title="pitch accent [{entry.pitch}]">
                {#each pitchMorae(entry.reading, entry.pitch) as m}
                  <span class="mora" class:high={m.high} class:drop={m.drop}>{m.text}</span>
                {/each}
              </span>
            {:else if entry.reading !== entry.term}
              {entry.reading}
            {/if}
          </div>
          <div class="term">{entry.term}</div>
          {#if entry.deinflectedFrom}
            <div class="deinflect">{entry.deinflectedFrom} → {entry.term}</div>
          {/if}
        </div>
        <div class="senses">
          {#if entry.tags.length}
            <div class="tags">{entry.tags.slice(0, 3).join(" · ")}</div>
          {/if}
          <ol class="defs">
            {#each entry.defs.slice(0, 3) as d}
              <li>{d}</li>
            {/each}
          </ol>
          {#if others.length}
            <div class="others">
              {#each others as o}
                <span>【{o.reading}】{o.defs.slice(0, 2).join("; ")}</span>
              {/each}
            </div>
          {/if}
          {#if entry.example}
            <div class="example">
              <span class="ex-jp"
                >{#each entry.example.j as seg}{#if seg.r}<ruby class:kw={seg.k}>{seg.t}<rt>{seg.r}</rt></ruby
                    >{:else}<span class:kw={seg.k}>{seg.t}</span>{/if}{/each}</span
              >
              <span class="ex-en">{entry.example.t}</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/key}
</div>

<style>
  .panel {
    font-family: var(--ui-font);
    color: var(--ink-soft);
    font-size: 13px;
    line-height: 1.5;
  }
  .rule {
    position: relative;
    height: 1px;
    background: var(--faint);
  }
  .marker {
    position: absolute;
    left: 0;
    top: -3px;
    width: 18px;
    height: 7px;
    will-change: transform;
    transition: transform 0.24s var(--ease-out);
  }
  .marker::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 3px;
    height: 1px;
    background: var(--accent);
  }
  .marker::after {
    /* small notch pointing up at the word */
    content: "";
    position: absolute;
    left: 6px;
    top: -1px;
    width: 6px;
    height: 6px;
    background: var(--paper);
    border-left: 1px solid var(--accent);
    border-top: 1px solid var(--accent);
    transform: rotate(45deg);
  }
  .body {
    display: grid;
    grid-template-columns: minmax(120px, auto) 1fr;
    gap: 0 28px;
    padding-top: 14px;
    animation: swap 0.28s var(--ease-out);
  }
  @keyframes swap {
    from {
      opacity: 0;
      transform: translate3d(0, 3px, 0);
    }
  }
  .head {
    border-right: 1px solid var(--faint);
    padding-right: 28px;
    min-width: 0;
  }
  .reading {
    font-size: 12px;
    color: var(--muted);
    letter-spacing: 0.06em;
    min-height: 1.6em;
  }
  .term {
    font-family: var(--font);
    font-size: 30px;
    line-height: 1.15;
    color: var(--ink);
    white-space: nowrap;
  }
  .deinflect {
    margin-top: 4px;
    font-size: 11px;
    color: var(--accent);
  }
  .pitch {
    display: inline-block;
  }
  .mora {
    position: relative;
    display: inline-block;
    padding-top: 0.25em;
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
    border-top: 1px solid currentColor;
  }
  .mora.drop {
    margin-right: 0.1em;
    padding-right: 0.1em;
  }
  .mora.high.drop::before {
    right: -0.1em;
    border-right: 1px solid currentColor;
  }
  .senses {
    min-width: 0;
  }
  .tags {
    font-size: 10.5px;
    color: var(--muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .defs {
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
    counter-reset: d;
    display: flex;
    flex-wrap: wrap;
    gap: 0 18px;
    font-size: 14px;
    color: var(--ink);
  }
  .defs li {
    counter-increment: d;
  }
  .defs li::before {
    content: counter(d, cjk-decimal);
    margin-right: 6px;
    font-size: 11px;
    color: var(--accent);
  }
  .others {
    margin-top: 2px;
    display: flex;
    flex-wrap: wrap;
    gap: 0 14px;
    font-size: 12px;
    color: var(--muted);
  }
  .example {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    font-size: 12.5px;
  }
  .ex-jp {
    color: var(--ink-soft);
  }
  .ex-jp rt {
    font-size: 0.62em;
    color: var(--muted);
  }
  .kw {
    color: var(--accent);
  }
  .ex-en {
    color: var(--muted);
    font-style: italic;
    font-size: 12px;
  }
</style>
