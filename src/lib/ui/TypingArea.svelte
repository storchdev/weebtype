<script lang="ts">
import { onMount } from "svelte";
import { buildCells, buildWords, currentCell } from "../core/cells.ts";
import { type Stats, TypingSession } from "../core/session.ts";
import type { Passage } from "../core/types.ts";
import { fontFamily } from "../fonts.ts";
import type { DisplayMode, HintMode } from "../settings.svelte.ts";
import DictPanel from "./DictPanel.svelte";

interface Props {
  passage: Passage;
  hint: HintMode;
  /** Show the dictionary panel for the current word. */
  dictionary: boolean;
  display: DisplayMode;
  font: string;
  fontSize: number;
  active: boolean;
  onfinish: (stats: Stats, session: TypingSession) => void;
  onrestart: () => void;
  onnew: () => void;
  onime: (on: boolean) => void;
  /** Newly completed kana (one call per accepted key that finishes any), with progress after it. */
  onkana?: (kana: string, done: number, total: number) => void;
  /** Every typing key, accepted or not (for key sounds). */
  onkey?: (ok: boolean) => void;
  /** Main area's top padding (clear of the branch), px. */
  reserveTop: number;
  /** Space kept free under the panel (battle stage), px. */
  reserveBottom: number;
  /** Narrow (phone) layout: the dictionary panel stacks. */
  narrow: boolean;
}

let {
  passage,
  hint,
  dictionary,
  display,
  font,
  fontSize,
  active,
  onfinish,
  onrestart,
  onnew,
  onime,
  onkana,
  onkey,
  reserveTop,
  reserveBottom,
  narrow,
}: Props = $props();

// A new TypingArea is mounted per run (parent wraps it in {#key}), so the
// passage is fixed for this component's lifetime.
// svelte-ignore state_referenced_locally
const session = new TypingSession(passage);
const cells = buildCells(session);
const words = buildWords(cells);
const els: HTMLSpanElement[] = [];

let snap = $state(session.snapshot());
let cur = $state(currentCell(cells, 0));
let idle = $state(true);
let live = $state({ kpm: 0, accuracy: 1 });

// Layout (measured after DOM updates; only when the current cell changes).
let pos = $state({ x: 0, y: 0, w: 0, h: 0, tokenX: 0 });
let offsetX = $state(0);
let offsetY = $state(0);
let viewportW = $state(0);
let viewportH = $state(0);
let stripH = $state(0);
let ready = $state(false);

let viewport: HTMLDivElement | undefined = $state();
let strip: HTMLDivElement | undefined = $state();
let caret: HTMLDivElement | undefined = $state();

const LINE = 2.45; // line-height in em
const linePitch = $derived(fontSize * LINE);
// Paragraph lines shown at once: up to 5, fewer on short windows so the text, the
// dictionary panel and the footer all fit below the branch without scrolling.
let winH = $state(window.innerHeight);
const maxLines = $derived.by(() => {
  const top = reserveTop + 62 + 64; // header + meta
  const below = (dictionary ? (narrow ? 250 : 200) : 40) + 56 + reserveBottom; // panel + footer + stage
  return Math.max(2, Math.min(5, Math.floor((winH - top - below) / linePitch)));
});

const curCell = $derived(cells[cur]);
const composition = $derived.by(() => {
  const c = curCell;
  if (!c) return { kana: "", romaji: "" };
  return {
    kana: c.kanji ? session.target.slice(c.start, Math.max(c.start, snap.kanaDone)) : "",
    romaji: snap.buffer,
  };
});
const hintToken = $derived(snap.token);
const hintGuide = $derived.by(() => {
  void snap;
  return session.guide(hintToken);
});
const hintReading = $derived(session.reading(hintToken));
const hintSurface = $derived(passage.tokens[hintToken]?.groups.map((g) => g.t).join("") ?? "");
const hintReadingDone = $derived.by(() => {
  const t = session.tokens[hintToken];
  return t ? Math.max(0, Math.min(t.end, snap.kanaDone) - t.start) : 0;
});
const progress = $derived(session.target.length ? snap.kanaDone / session.target.length : 0);

// ---- measurement -------------------------------------------------------

function measure(): void {
  if (!strip || !viewport) return;
  const i = Math.min(cur, cells.length - 1);
  const el = els[i];
  if (!el) return;
  const finished = cur >= cells.length;
  const x = finished ? el.offsetLeft + el.offsetWidth : el.offsetLeft;
  const y = el.offsetTop;
  const c = cells[i];
  let tokenX = x;
  if (c) {
    let j = i;
    while (j > 0 && cells[j - 1]?.token === c.token && els[j - 1]?.offsetTop === y) j--;
    tokenX = els[j]?.offsetLeft ?? x;
  }
  pos = { x, y, w: finished ? 0 : el.offsetWidth, h: el.offsetHeight, tokenX };
  viewportW = viewport.clientWidth;
  stripH = strip.scrollHeight;

  if (display === "ticker") {
    offsetX = x - viewportW * 0.38;
    offsetY = 0;
    viewportH = linePitch;
  } else {
    offsetX = 0;
    const maxH = maxLines * linePitch;
    viewportH = Math.min(stripH, maxH);
    const lineTop = y - (linePitch - el.offsetHeight) / 2;
    const target = lineTop - linePitch; // keep one line of context above
    offsetY = Math.max(0, Math.min(target, stripH - viewportH));
  }
  ready = true;
}

$effect(() => {
  // Re-measure when the current cell, display mode or font changes.
  void cur;
  void display;
  void fontSize;
  void font;
  void maxLines;
  measure();
});

onMount(() => {
  const ro = new ResizeObserver(() => measure());
  if (viewport) ro.observe(viewport);
  if (strip) ro.observe(strip);
  document.fonts.ready.then(() => measure());
  const tick = setInterval(() => {
    if (!snap.started || snap.finished) return;
    const st = session.stats(performance.now());
    live = { kpm: st.kpm, accuracy: st.accuracy };
  }, 500);
  return () => {
    ro.disconnect();
    clearInterval(tick);
  };
});

// ---- input ---------------------------------------------------------------

let idleTimer: ReturnType<typeof setTimeout> | undefined;
const KANA_KEY = /[぀-ヿ]/;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function animate(el: Element | undefined, frames: Keyframe[], ms: number): void {
  if (!el || reduceMotion.matches) return;
  el.animate(frames, { duration: ms, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
}

// Touch devices have no physical keyboard events: a hidden input opens the on-screen
// keyboard and its text is fed through the same path as key presses.
const touch = window.matchMedia("(pointer: coarse)").matches;
let soft: HTMLInputElement | undefined = $state();
let softFocused = $state(false);
let consumed = 0;

function focusSoft(): void {
  if (touch && active) soft?.focus({ preventScroll: true });
}

function onSoftInput(e: Event): void {
  if (!soft) return;
  const v = soft.value;
  const add = v.length > consumed ? v.slice(consumed) : "";
  consumed = v.length;
  for (const ch of add) {
    if (!active || snap.finished) break;
    if (KANA_KEY.test(ch)) {
      onime(true);
      continue;
    }
    if (ch === " " || ch === "\n") continue;
    onime(false);
    press(ch);
  }
  if (!(e as InputEvent).isComposing) resetSoft();
}

function resetSoft(): void {
  if (soft) soft.value = "";
  consumed = 0;
}

function onKey(e: KeyboardEvent): void {
  if (!active || snap.finished) return;
  // typing into the hidden touch input arrives as input events; only Tab is handled here
  if (soft && e.target === soft && e.key !== "Tab") return;
  if (e.isComposing || e.key === "Process" || e.keyCode === 229) {
    onime(true);
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Tab") {
    e.preventDefault();
    if (e.shiftKey) onnew();
    else onrestart();
    return;
  }
  if (e.key.length !== 1) return;
  if (e.key === " ") {
    e.preventDefault();
    return;
  }
  if (KANA_KEY.test(e.key)) {
    onime(true);
    return;
  }
  e.preventDefault();
  onime(false);
  press(e.key);
}

function press(key: string): void {
  const before = cur;
  const doneBefore = snap.kanaDone;
  const ok = session.press(key, performance.now());
  onkey?.(ok);
  snap = session.snapshot();
  if (onkana && snap.kanaDone > doneBefore) {
    onkana(session.target.slice(doneBefore, snap.kanaDone), snap.kanaDone, session.target.length);
  }
  cur = currentCell(cells, snap.kanaDone, before);

  idle = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => (idle = true), 900);

  if (!ok) {
    animate(
      els[cur],
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-0.06em)" },
        { transform: "translateX(0.05em)" },
        { transform: "translateX(0)" },
      ],
      180,
    );
    animate(caret, [{ opacity: 1, backgroundColor: "var(--accent)" }, { opacity: 1 }], 260);
  }
  for (let i = before; i < cur; i++) {
    if (cells[i]?.kanji) {
      animate(
        els[i],
        [
          { opacity: 0.35, transform: "translateY(0.1em) scale(0.97)" },
          { opacity: 1, transform: "none" },
        ],
        280,
      );
    }
  }
  if (snap.finished) onfinish(session.stats(performance.now()), session);
}

// Hint placement. The romaji guide sits in the line gap right under the current
// word; the dictionary card sits below the text block so it never covers text.
const guideX = $derived(pos.tokenX - offsetX);
const guideY = $derived(pos.y - offsetY + pos.h * 0.94);
const guideSize = $derived(Math.max(11, Math.min(16, fontSize * 0.36)));
const dictEntry = $derived(dictionary ? passage.tokens[hintToken]?.dict : undefined);
const markerX = $derived(Math.max(0, Math.min(guideX, viewportW - 18)));
const panelY = $derived(viewportH + guideSize * 1.4 + 22);
</script>

<svelte:window onkeydown={onKey} bind:innerHeight={winH} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="area" class:narrow onclick={focusSoft} style="--font: {fontFamily(font)}; --size: {fontSize}px; --line: {LINE};">
  <div class="meta">
    <div class="live" class:show={snap.started}>
      <span><b>{Math.round(live.kpm)}</b> 字/分</span>
      <span><b>{Math.round(live.accuracy * 100)}</b>%</span>
    </div>
    <div class="count"><b>{snap.kanaDone}</b> / {session.target.length}</div>
  </div>
  <div class="progress"><div class="bar" style="transform: scaleX({progress})"></div></div>

  <div class="stage" class:ready class:with-card={dictionary}>
    <div
      class="viewport {display}"
      bind:this={viewport}
      style="height: {viewportH ? `${viewportH}px` : 'auto'}"
      class:clipped-top={offsetY > 1}
      class:clipped-bottom={display === "paragraph" && stripH - offsetY - viewportH > 1}
    >
      <div class="strip" bind:this={strip} style="transform: translate3d({-offsetX}px, {-offsetY}px, 0)">
        {#each words as word}<span class="word"
            >{#each word as i}{@const c = cells[i]!}<span
                bind:this={els[i]}
                class="cell"
                class:kanji={c.kanji}
                class:punct={c.punct}
                class:done={i < cur}
                class:cur={i === cur}
                class:tok={c.token === snap.token}>{c.text}</span
              >{/each}</span
          >{/each}
        <div
          class="caret"
          class:idle
          class:hidden={snap.finished}
          bind:this={caret}
          style="transform: translate3d({pos.x}px, {pos.y + pos.h * 0.14}px, 0); height: {pos.h * 0.72}px"
        ></div>
        {#if composition.kana || composition.romaji}
          <div
            class="comp"
            style="transform: translate3d({pos.x + pos.w / 2}px, {pos.y + pos.h * 0.1}px, 0) translate(-50%, -100%)"
          >
            <span class="ck">{composition.kana}</span><span class="cr">{composition.romaji}</span>
          </div>
        {/if}
      </div>
    </div>

    {#if hint !== "off" && !snap.finished}
      <div
        class="guide"
        style="transform: translate3d({guideX}px, {guideY}px, 0); font-size: {guideSize}px"
        aria-live="polite"
      >
        {#if hintReading !== hintSurface}<span class="g-reading"
            ><span class="g-done">{hintReading.slice(0, hintReadingDone)}</span>{hintReading.slice(
              hintReadingDone,
            )}</span
          >{/if}{#if hint !== "kana"}<span class="g-romaji"
          ><span class="g-typed">{hintGuide.typed}</span><span class="g-next">{hintGuide.rest.slice(0, 1)}</span
          >{hintGuide.rest.slice(1)}</span
          >{/if}
      </div>
    {/if}
    {#if dictionary && !snap.finished}
      <div class="panel-pos" style="transform: translate3d(0, {panelY}px, 0)">
        <DictPanel entries={dictEntry} surface={hintSurface} {markerX} tokenKey={hintToken} {narrow} />
      </div>
    {/if}
  </div>
  {#if touch}
    <input
      bind:this={soft}
      class="soft"
      type="text"
      aria-label="Type romaji"
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
      enterkeyhint="next"
      oninput={onSoftInput}
      oncompositionend={resetSoft}
      onfocus={() => (softFocused = true)}
      onblur={() => (softFocused = false)}
    />
    {#if !softFocused && !snap.finished}
      <button class="pbtn tap" onclick={focusSoft}>tap to type</button>
    {/if}
  {/if}
</div>

<style>
  /* the touch keyboard's target: present (so it can take focus) but invisible; 16px so
     iOS doesn't zoom on focus */
  .soft {
    position: fixed;
    left: 0;
    bottom: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    font-size: 16px;
    border: 0;
    padding: 0;
    pointer-events: none;
  }
  .tap {
    display: block;
    margin: 18px auto 0;
  }
  .area {
    position: relative;
    width: 100%;
  }
  .meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    height: 20px;
    margin-bottom: 8px;
    color: var(--muted);
    font-size: 12.5px;
  }
  .live {
    display: flex;
    gap: 16px;
    opacity: 0;
    transition: opacity 0.4s var(--ease-out);
  }
  .live.show {
    opacity: 1;
  }
  .live b,
  .count b {
    color: var(--ink-soft);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
  .progress {
    height: 1px;
    background: var(--faint);
    margin-bottom: 36px;
  }
  .bar {
    height: 2px;
    margin-top: -0.5px;
    background: var(--accent);
    transform-origin: left;
    transition: transform 0.25s var(--ease-out);
  }

  .stage {
    position: relative;
    opacity: 0;
    transition: opacity 0.35s var(--ease-out);
  }
  .stage.ready {
    opacity: 1;
  }
  .stage {
    padding-bottom: 2.2em;
  }
  .stage.with-card {
    padding-bottom: 200px;
  }
  .viewport {
    position: relative;
    overflow: hidden;
    font-family: var(--font);
    font-size: var(--size);
    line-height: var(--line);
    transition: height 0.3s var(--ease-out);
    /* room for the composition above the first line */
    padding-top: 0;
  }
  .viewport.paragraph.clipped-top {
    mask-image: linear-gradient(to bottom, transparent 0, #000 0.9em, #000 100%);
  }
  .viewport.paragraph.clipped-bottom {
    mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 1.2em), transparent 100%);
  }
  .viewport.paragraph.clipped-top.clipped-bottom {
    mask-image: linear-gradient(to bottom, transparent 0, #000 0.9em, #000 calc(100% - 1.2em), transparent 100%);
  }
  .viewport.ticker {
    mask-image: linear-gradient(to right, transparent 0, #000 12%, #000 80%, transparent 100%);
  }
  .strip {
    position: relative;
    will-change: transform;
    transition: transform 0.16s var(--ease-out);
  }
  .paragraph .strip {
    transition-duration: 0.35s;
  }
  .ticker .strip {
    white-space: nowrap;
    width: max-content;
  }

  .cell {
    display: inline-block;
    line-height: 1.5;
    color: var(--muted);
    transition: color 0.12s linear;
  }
  .cell.tok {
    color: color-mix(in srgb, var(--muted) 55%, var(--ink-soft));
  }
  .cell.done {
    color: var(--ink);
  }
  .cell.punct.done {
    color: var(--ink-soft);
  }
  .word {
    white-space: nowrap;
  }
  .ticker .word {
    margin-right: 0.12em;
  }

  .caret {
    position: absolute;
    left: -1px;
    top: 0;
    width: 2px;
    border-radius: 1px;
    background: var(--accent);
    will-change: transform;
    transition:
      transform 0.11s var(--ease-out),
      height 0.11s var(--ease-out);
  }
  .caret.idle {
    animation: blink 1.1s ease-in-out infinite;
  }
  .caret.hidden {
    opacity: 0;
  }
  @keyframes blink {
    0%,
    45% {
      opacity: 1;
    }
    60%,
    90% {
      opacity: 0.15;
    }
  }

  .comp {
    position: absolute;
    left: 0;
    top: 0;
    font-size: 0.42em;
    line-height: 1.2;
    white-space: nowrap;
    pointer-events: none;
    transition: transform 0.11s var(--ease-out);
    animation: comp-in 0.14s var(--ease-out);
  }
  .ck {
    color: var(--ink);
  }
  .cr {
    font-family: "M PLUS 1 Code", monospace;
    color: var(--accent);
  }
  @keyframes comp-in {
    from {
      opacity: 0;
    }
  }

  .guide,
  .panel-pos {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    will-change: transform;
    transition: transform 0.2s var(--ease-out);
  }
  .ticker ~ .guide {
    transition-duration: 0.16s;
  }
  .guide {
    z-index: 2;
    display: flex;
    gap: 0.7em;
    white-space: nowrap;
    line-height: 1.2;
    animation: fade-in 0.3s var(--ease-out);
  }
  .g-reading {
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  .g-done {
    color: var(--ink-soft);
  }
  .g-romaji {
    font-family: "M PLUS 1 Code", monospace;
    color: var(--muted);
  }
  .g-typed {
    color: var(--accent);
  }
  .panel-pos {
    right: 0;
    transition-duration: 0.3s;
  }
  .g-next {
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: var(--accent);
    text-underline-offset: 3px;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
</style>
