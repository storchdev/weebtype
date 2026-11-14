<script lang="ts">
import { onMount } from "svelte";
import { fetchFallback, fetchHealth, fetchPassage, prefetch, requestFor } from "./lib/api.ts";
import type { Stats, TypingSession } from "./lib/core/session.ts";
import type { HealthResponse, Passage } from "./lib/core/types.ts";
import { addHistory, type HistoryEntry, loadHistory } from "./lib/history.ts";
import { currentModel, settings } from "./lib/settings.svelte.ts";
import HistoryPanel from "./lib/ui/HistoryPanel.svelte";
import Petals from "./lib/ui/Petals.svelte";
import PlumBranch from "./lib/ui/PlumBranch.svelte";
import Results from "./lib/ui/Results.svelte";
import SettingsPanel from "./lib/ui/SettingsPanel.svelte";
import TypingArea from "./lib/ui/TypingArea.svelte";

type View = "typing" | "results" | "history";

let view: View = $state("typing");
let passage: Passage | null = $state(null);
let runId = $state(0);
/** Bumped on each click of the logo seal to replay its stamp ink ring. */
let stamps = $state(0);
let loading = $state(false);
let warning = $state("");
let health: HealthResponse | null = $state(null);
let settingsOpen = $state(false);
let imeOn = $state(false);
let result: { stats: Stats; session: TypingSession } | null = $state(null);
let history: HistoryEntry[] = $state(loadHistory());
let abort: AbortController | null = null;

// ---- theme ---------------------------------------------------------------
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let systemDark = $state(darkQuery.matches);
darkQuery.addEventListener("change", (e) => (systemDark = e.matches));
const dark = $derived(settings.theme === "dark" || (settings.theme === "system" && systemDark));
$effect(() => {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
});

// ---- passages --------------------------------------------------------------
const genKey = $derived(JSON.stringify(requestFor(settings)));
let loadedKey = "";

async function loadPassage(): Promise<void> {
  abort?.abort();
  const ctrl = new AbortController();
  abort = ctrl;
  loading = true;
  warning = "";
  loadedKey = genKey;
  try {
    const res = await fetchPassage(requestFor(settings), ctrl.signal);
    if (ctrl.signal.aborted) return;
    passage = res.passage;
    warning = res.warning ?? "";
    startRun();
  } catch (e) {
    if (ctrl.signal.aborted) return;
    warning = `Server unreachable: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    if (abort === ctrl) loading = false;
  }
}

async function useOffline(): Promise<void> {
  abort?.abort();
  loading = false;
  try {
    passage = await fetchFallback(requestFor(settings));
    warning = "";
    startRun();
  } catch (e) {
    warning = `Server unreachable: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function startRun(): void {
  runId++;
  result = null;
  view = "typing";
}

function finish(stats: Stats, session: TypingSession): void {
  result = { stats, session };
  const p = session.passage;
  history = addHistory(
    stats,
    p.level,
    p.source,
    p.tokens.map((t) => t.groups.map((g) => g.t).join("")).join(""),
  );
  // Small pause so the last character's ink settles before the results slide in.
  setTimeout(() => (view = "results"), 350);
}

function closeSettings(): void {
  settingsOpen = false;
  if (genKey !== loadedKey && view !== "history") void loadPassage();
  else prefetch(requestFor(settings));
}

// ---- global keys -----------------------------------------------------------
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    if (settingsOpen) closeSettings();
    else if (view === "history") view = passage ? "typing" : view;
    else settingsOpen = true;
    return;
  }
  if (settingsOpen) return;
  if (e.key === "Tab" && e.shiftKey && view !== "typing") {
    // Shift+Tab: new passage from results/history (the typing view handles its own).
    e.preventDefault();
    void loadPassage();
    return;
  }
  if (view === "results") {
    if (e.key === "Enter") {
      e.preventDefault();
      void loadPassage();
    } else if (e.key === "Tab") {
      e.preventDefault();
      startRun();
    }
  } else if (view === "typing" && !passage && !loading && e.key === "Enter") {
    void loadPassage();
  }
}

onMount(() => {
  void fetchHealth().then((h) => (health = h));
  void loadPassage();
});

const sourceLabel = $derived.by(() => {
  if (!passage) return "";
  if (passage.source === "tatoeba") return "Tatoeba sentences (CC BY 2.0 FR) via Jitendex";
  if (passage.source === "builtin") return "built-in sample";
  return `${passage.source}${currentModel(settings) ? ` · ${currentModel(settings)}` : ""}`;
});
const LEVEL_JA: Record<string, string> = { native: "母語" };
</script>

<svelte:window onkeydown={onKey} />

<div class="grain" aria-hidden="true"></div>
<div class="branch-wrap" aria-hidden="true"><PlumBranch /></div>
{#if settings.petals}<Petals />{/if}

<div class="shell">
  <header class="top">
    <button
      class="brand"
      onclick={() => {
        stamps++;
        view = passage ? "typing" : view;
      }}
      aria-label="weebtype home"
    >
      <span class="seal-wrap">
        {#key stamps}{#if stamps}<span class="ink"></span>{/if}{/key}
        <span class="seal">打</span>
      </span>
      <span class="word">weebtype<small>和文タイピング</small></span>
    </button>
    <nav>
      <button class="tbtn chip" onclick={() => (settingsOpen = true)} title="Change test settings">
        {LEVEL_JA[settings.level] ?? settings.level} · {settings.length}字{settings.topic
          ? ` · ${settings.topic}`
          : ""}
      </button>
      <button
        class="tbtn"
        class:on={view === "history"}
        onclick={() => (view = view === "history" ? (passage ? "typing" : "history") : "history")}
        title="History">記録</button
      >
      <button class="tbtn" onclick={() => (settingsOpen = true)} title="Settings (Esc)">設定</button>
      <button
        class="tbtn theme"
        onclick={() => (settings.theme = dark ? "light" : "dark")}
        title="Toggle theme"
        aria-label="Toggle theme"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          {#if dark}
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          {:else}
            <circle cx="12" cy="12" r="4.2" />
            {#each [0, 45, 90, 135, 180, 225, 270, 315] as a}
              <line x1="12" y1="2.5" x2="12" y2="5" transform="rotate({a} 12 12)" />
            {/each}
          {/if}
        </svg>
      </button>
    </nav>
  </header>

  {#if imeOn}
    <div class="banner" role="alert">
      IMEがオンになっています — switch your input method to direct/English (半角英数). weebtype converts romaji itself.
    </div>
  {/if}

  <main>
    {#if view === "history"}
      <HistoryPanel entries={history} onchange={(list) => (history = list)} />
    {:else if view === "results" && result}
      <Results
        stats={result.stats}
        session={result.session}
        onnext={() => void loadPassage()}
        onretry={startRun}
      />
    {:else if loading && !passage}
      {@render loader()}
    {:else if passage}
      <div class="typing-wrap">
      <div class="typing" class:dim={loading}>
        {#key runId}
          <TypingArea
            {passage}
            hint={settings.hint}
            display={settings.display}
            font={settings.font}
            fontSize={settings.fontSize}
            active={!settingsOpen && view === "typing" && !loading}
            onfinish={finish}
            onrestart={startRun}
            onnew={() => void loadPassage()}
            onime={(on) => (imeOn = on)}
          />
        {/key}
      </div>
      {#if loading}
        <!-- over the dimmed text, not below it (the stage reserves room for the
             dictionary panel, which pushed a trailing loader off-screen) -->
        <div class="loader-over">{@render loader()}</div>
      {/if}
      </div>
    {:else}
      <p class="empty">Press <kbd>Enter</kbd> to load a passage.</p>
    {/if}

    {#if warning}
      <p class="warning">{warning}</p>
    {/if}
  </main>

  <footer>
    <span><kbd>Tab</kbd> restart</span>
    <span><kbd>⇧ Tab</kbd> new passage</span>
    <span><kbd>Esc</kbd> settings</span>
    {#if health && !health.dictionary}
      <span class="warn">dictionary not loaded — run <code>bun run data:import</code> for meanings</span>
    {/if}
    {#if sourceLabel}<span class="source">{sourceLabel}</span>{/if}
  </footer>
</div>

<SettingsPanel open={settingsOpen} onclose={closeSettings} backends={health?.backends ?? null} />

{#snippet loader()}
  <div class="loader">
    <svg viewBox="0 0 100 100" width="56" height="56" aria-hidden="true">
      <circle cx="50" cy="50" r="38" />
    </svg>
    <p>
      文章を作っています…<small>generating with {settings.backend}</small>
    </p>
    <button class="tbtn" onclick={useOffline}>use an offline sentence instead</button>
  </div>
{/snippet}

<style>
  .grain {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: var(--grain-opacity);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.42  0 0 0 0 0.33  0 0 0 0.09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  }
  .branch-wrap {
    position: fixed;
    top: -6px;
    right: -10px;
    width: var(--branch-w);
    pointer-events: none;
    z-index: 0;
    opacity: 0.95;
    animation: branch-in 1.2s var(--ease-out);
  }
  @keyframes branch-in {
    from {
      opacity: 0;
      transform: translate3d(12px, -8px, 0);
    }
  }
  :global(:root) {
    /* shared by the branch and the main area's top padding */
    --branch-w: min(clamp(200px, 30vw, 440px), 44vh);
    --branch-h: calc(var(--branch-w) * 0.545);
  }
  .shell {
    position: relative;
    z-index: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    max-width: 1040px;
    margin: 0 auto;
    padding: 22px 32px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    background: none;
    border: none;
    padding: 0;
  }
  .seal {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 7px;
    background: var(--accent);
    color: var(--paper-raised);
    font-family: var(--title-font);
    font-size: 21px;
    transform: rotate(-4deg);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--paper-raised) 25%, transparent);
    /* springy settle back after the press */
    transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .seal-wrap {
    position: relative;
    display: grid;
  }
  /* hover: the seal straightens and lifts off the paper */
  .brand:hover .seal,
  .brand:focus-visible .seal {
    transform: rotate(0deg) translate3d(0, -2px, 0) scale(1.06);
  }
  /* press: stamp it down */
  .brand:active .seal {
    transform: rotate(-1deg) scale(0.86);
    transition-duration: 0.08s;
    transition-timing-function: ease-out;
  }
  /* ink ring left on the paper by the stamp, spreading and fading */
  .ink {
    position: absolute;
    inset: 0;
    border-radius: 7px;
    border: 1.5px solid var(--accent);
    pointer-events: none;
    animation: ink 0.7s var(--ease-out) forwards;
  }
  @keyframes ink {
    from {
      opacity: 0.7;
      transform: rotate(-4deg) scale(0.9);
    }
    to {
      opacity: 0;
      transform: rotate(-4deg) scale(1.75);
    }
  }
  .word {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    font-family: var(--title-font);
    font-size: 20px;
    font-weight: 600;
    line-height: 1.05;
    letter-spacing: 0.02em;
    gap: 5px;
  }
  .word small {
    font-size: 10.5px;
    font-weight: 400;
    color: var(--muted);
    letter-spacing: 0.25em;
  }
  nav {
    display: flex;
    align-items: center;
    gap: 20px;
    /* keep clear of the branch */
    margin-right: clamp(0px, 14vw, 220px);
  }
  .chip {
    color: var(--muted);
    padding-right: 20px;
    border-right: 1px solid var(--faint);
  }
  .chip::after {
    right: 20px;
  }
  .theme {
    display: grid;
    place-items: center;
  }
  .theme svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .theme path {
    fill: currentColor;
    stroke: none;
  }
  .banner {
    margin: 16px auto 0;
    padding: 8px 14px;
    border-radius: 4px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 13px;
    animation: rise 0.3s var(--ease-out);
  }
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: safe center;
    /* the branch hangs over the top-right corner: start content below its lowest
       blossom so it can never overlap the text (header is ~62px tall) */
    padding: max(4vh, calc(var(--branch-h) - 30px)) 0 6vh;
    min-height: 0;
  }
  .typing-wrap {
    position: relative;
  }
  .typing {
    transition: opacity 0.3s var(--ease-out);
  }
  .loader-over {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: start center;
    /* roughly the middle of the text block, above the panel space */
    padding-top: 120px;
    pointer-events: none;
  }
  .loader-over :global(.loader) {
    margin-top: 0;
    padding: 14px 22px;
    border-radius: 4px;
    background: var(--paper);
    /* feathered paper backdrop so the dimmed text doesn't show through */
    box-shadow: 0 0 36px 30px var(--paper);
    pointer-events: auto;
  }
  .typing.dim {
    opacity: 0.15;
  }
  .empty {
    color: var(--muted);
    text-align: center;
  }
  .warning {
    color: var(--accent);
    font-size: 13px;
    margin-top: 24px;
    max-width: 80ch;
  }
  .loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin-top: 24px;
    animation: rise 0.4s var(--ease-out);
  }
  .loader svg circle {
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-dasharray: 239;
    stroke-dashoffset: 239;
    transform-origin: 50% 50%;
    animation:
      enso 2.4s var(--ease-out) infinite,
      enso-turn 2.4s linear infinite;
  }
  @keyframes enso {
    0% {
      stroke-dashoffset: 239;
      opacity: 0.9;
    }
    60% {
      stroke-dashoffset: 18;
      opacity: 0.9;
    }
    100% {
      stroke-dashoffset: 18;
      opacity: 0;
    }
  }
  @keyframes enso-turn {
    to {
      transform: rotate(360deg);
    }
  }
  .loader p {
    margin: 0;
    font-family: var(--title-font);
    color: var(--ink-soft);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .loader small {
    font-family: var(--ui-font);
    font-size: 11px;
    color: var(--muted);
  }
  .loader button {
    margin-top: 8px;
    font-size: 12px;
    color: var(--muted);
  }
  footer {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--muted);
  }
  footer .source {
    margin-left: auto;
  }
  footer .warn {
    color: var(--accent);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>
