<script lang="ts">
import { noteName } from "../core/accent.ts";
import { type Backend, LEVELS } from "../core/types.ts";
import { FONTS } from "../fonts.ts";
import { playKey } from "../keysound.ts";
import { FONT_SIZE_RANGE, LENGTH_PRESETS, saveSettings, settings } from "../settings.svelte.ts";
import { singer, voicebank } from "../singer.ts";

function previewVoice(): void {
  singer.setVolume(settings.battleVolume / 100);
  singer.setRange({ low: settings.voiceLow, high: settings.voiceHigh });
  singer.preview();
}

interface Props {
  open: boolean;
  onclose: () => void;
  backends: Record<Backend, boolean> | null;
  /** Whether offline sentences exist (needs `data:setup`); null = unknown. */
  tatoeba: boolean | null;
}
let { open, onclose, backends, tatoeba }: Props = $props();

const LEVEL_LABEL: Record<string, string> = {
  N5: "N5",
  N4: "N4",
  N3: "N3",
  N2: "N2",
  N1: "N1",
  native: "母語",
};

let customLength = $state(!LENGTH_PRESETS.includes(settings.length as (typeof LENGTH_PRESETS)[number]));

$effect(() => {
  // Persist on any change.
  JSON.stringify(settings);
  saveSettings();
});
</script>

<div class="scrim" class:open onclick={onclose} aria-hidden="true"></div>
<aside class="panel" class:open aria-hidden={!open} inert={!open}>
  <header>
    <h2>設定 <span>settings</span></h2>
    <button class="close" onclick={onclose} aria-label="Close settings"><kbd>Esc</kbd></button>
  </header>

  <section>
    <h3>文章 <span>passages</span></h3>
    <div class="field">
      <span class="label">Generator</span>
      <div class="seg">
        {#each ["claude", "codex", "llama"] as const as b}
          <button class="tbtn" class:on={settings.backend === b} onclick={() => (settings.backend = b)}>
            {b}
            {#if backends && !backends[b]}<em>{b === "llama" ? "offline" : "missing"}</em>{/if}
          </button>
        {/each}
        <button class="tbtn" class:on={settings.backend === "tatoeba"} onclick={() => (settings.backend = "tatoeba")}>
          tatoeba
          <em>{tatoeba === false ? "run data:setup" : "no AI"}</em>
        </button>
      </div>
    </div>
    {#if settings.backend !== "tatoeba"}
    <label class="field">
      <span class="label">Model</span>
      {#if settings.backend === "claude"}
        <input bind:value={settings.claudeModel} placeholder="default (e.g. sonnet, haiku)" />
      {:else if settings.backend === "llama"}
        <input bind:value={settings.llamaModel} placeholder="optional (llama-server uses its loaded model)" />
      {:else}
        <input bind:value={settings.codexModel} placeholder="default" />
      {/if}
    </label>
    {#if settings.backend === "llama"}
      <label class="field">
        <span class="label">Server <small>llama-server</small></span>
        <input bind:value={settings.llamaUrl} placeholder="http://127.0.0.1:8080" />
      </label>
    {/if}
    {/if}
    <div class="field">
      <span class="label">Vocabulary</span>
      <div class="seg">
        {#each LEVELS as l}
          <button class="tbtn" class:on={settings.level === l} onclick={() => (settings.level = l)}>{LEVEL_LABEL[l]}</button>
        {/each}
      </div>
    </div>
    <div class="field">
      <span class="label">Length <small>≈ kana</small></span>
      <div class="seg">
        {#each LENGTH_PRESETS as n}
          <button
            class="tbtn"
            class:on={!customLength && settings.length === n}
            onclick={() => {
              customLength = false;
              settings.length = n;
            }}>{n}</button
          >
        {/each}
        <button class="tbtn" class:on={customLength} onclick={() => (customLength = true)}>custom</button>
      </div>
      {#if customLength}
        <input type="number" min="20" max="1000" step="10" bind:value={settings.length} />
      {/if}
    </div>
    {#if settings.backend !== "tatoeba"}
      <label class="field">
        <span class="label">Topic <small>optional</small></span>
        <input bind:value={settings.topic} placeholder="e.g. 料理, 旅行, space, cats…" />
      </label>
    {/if}
  </section>

  <section>
    <h3>ヒント <span>hint</span></h3>
    <div class="field">
      <span class="label">Under the word</span>
      <div class="seg">
        <button class="tbtn" class:on={settings.hint === "romaji"} onclick={() => (settings.hint = "romaji")}>kana + romaji</button>
        <button class="tbtn" class:on={settings.hint === "kana"} onclick={() => (settings.hint = "kana")}>kana only</button>
        <button class="tbtn" class:on={settings.hint === "off"} onclick={() => (settings.hint = "off")}>off</button>
      </div>
    </div>
    <label class="field check">
      <input type="checkbox" bind:checked={settings.dictionary} />
      <span>Dictionary <small>meaning, pitch accent, example</small></span>
    </label>
  </section>

  <section>
    <h3>表示 <span>display</span></h3>
    <div class="field">
      <span class="label">Layout</span>
      <div class="seg">
        <button class="tbtn" class:on={settings.display === "paragraph"} onclick={() => (settings.display = "paragraph")}
          >paragraph</button
        >
        <button class="tbtn" class:on={settings.display === "ticker"} onclick={() => (settings.display = "ticker")}
          >scrolling line</button
        >
      </div>
    </div>
    <div class="field">
      <span class="label">Theme</span>
      <div class="seg">
        {#each [["system", "auto"], ["light", "light"], ["dark", "dark"]] as const as [v, label]}
          <button class="tbtn" class:on={settings.theme === v} onclick={() => (settings.theme = v)}>{label}</button>
        {/each}
      </div>
    </div>
    <label class="field">
      <span class="label">Size <small>{settings.fontSize}px</small></span>
      <input type="range" min={FONT_SIZE_RANGE.min} max={FONT_SIZE_RANGE.max} bind:value={settings.fontSize} />
    </label>
    <label class="field check">
      <input type="checkbox" bind:checked={settings.petals} />
      <span>Falling petals</span>
    </label>
  </section>

  <section>
    <h3>遊び <span>extras</span></h3>
    <label class="field check">
      <input type="checkbox" bind:checked={settings.battle} onchange={() => settings.battle && previewVoice()} />
      <span>Singer vs. marshmallow</span>
    </label>
    {#if settings.battle}
      <label class="field">
        <span class="label">Voice <small>{settings.battleVolume ? `${settings.battleVolume}%` : "muted"}</small></span>
        <input type="range" min="0" max="100" step="5" bind:value={settings.battleVolume} onchange={previewVoice} />
      </label>
      <div class="field">
        <span class="label">Range <small>{noteName(settings.voiceLow)} – {noteName(settings.voiceHigh)}</small></span>
        <div class="range2">
          <input
            type="range"
            min="-19"
            max="12"
            aria-label="Lowest note"
            bind:value={settings.voiceLow}
            oninput={() => (settings.voiceHigh = Math.max(settings.voiceHigh, settings.voiceLow + 7))}
            onchange={previewVoice}
          />
          <input
            type="range"
            min="-12"
            max="19"
            aria-label="Highest note"
            bind:value={settings.voiceHigh}
            oninput={() => (settings.voiceLow = Math.min(settings.voiceLow, settings.voiceHigh - 7))}
            onchange={previewVoice}
          />
        </div>
      </div>
      {#await voicebank() then bank}
        <p class="note">
          {#if bank}voicebank: {bank.name}{:else}built-in synth · unzip a UTAU CV voicebank into <code>data/voice/</code> for a real voice{/if}
        </p>
      {/await}
    {/if}
    <label class="field check">
      <input
        type="checkbox"
        bind:checked={settings.keySounds}
        onchange={() => settings.keySounds && playKey(settings.keyVolume / 100)}
      />
      <span>Keyboard sounds</span>
    </label>
    {#if settings.keySounds}
      <label class="field">
        <span class="label">Clicks <small>{settings.keyVolume ? `${settings.keyVolume}%` : "muted"}</small></span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          bind:value={settings.keyVolume}
          onchange={() => playKey(settings.keyVolume / 100)}
        />
      </label>
    {/if}
  </section>

  <section>
    <h3>書体 <span>font</span></h3>
    <div class="fonts">
      {#each FONTS as f}
        <button class="font" class:on={settings.font === f.id} onclick={() => (settings.font = f.id)}>
          <span class="sample" style="font-family: {f.family}">梅の花が咲いた</span>
          <span class="fname">{f.name} <small>{f.note}</small></span>
        </button>
      {/each}
    </div>
  </section>
</aside>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(20 15 10 / 0.18);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s var(--ease-out);
    z-index: 20;
  }
  .scrim.open {
    opacity: 1;
    pointer-events: auto;
  }
  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(420px, 92vw);
    background: var(--paper-raised);
    border-left: 1px solid var(--faint);
    box-shadow: var(--shadow);
    padding: 20px 24px 40px;
    overflow-y: auto;
    z-index: 21;
    transform: translate3d(104%, 0, 0);
    transition: transform 0.38s var(--ease-out);
    will-change: transform;
  }
  .panel.open {
    transform: none;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    font-family: var(--title-font);
    font-weight: 600;
    font-size: 22px;
    margin: 0;
  }
  h2 span,
  h3 span {
    font-family: var(--ui-font);
    font-weight: 400;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.08em;
    margin-left: 6px;
  }
  .close {
    background: none;
    border: none;
  }
  section {
    margin-top: 22px;
    padding-top: 16px;
    border-top: 1px solid var(--faint);
  }
  h3 {
    font-family: var(--title-font);
    font-weight: 600;
    font-size: 15px;
    margin: 0 0 12px;
    color: var(--ink-soft);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }
  .field.check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .label {
    font-size: 12px;
    color: var(--ink-soft);
  }
  .label small,
  .check small {
    color: var(--muted);
    margin-left: 4px;
  }
  .check small {
    font-size: 12px;
  }
  input:not([type]),
  input[type="number"] {
    background: var(--paper);
    border: 1px solid var(--faint);
    border-radius: 4px;
    padding: 7px 10px;
    transition: border-color 0.2s;
  }
  input:not([type]):focus,
  input[type="number"]:focus {
    border-color: var(--accent);
    outline: none;
  }
  input[type="range"],
  input[type="checkbox"] {
    accent-color: var(--accent);
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
  }
  .seg em {
    font-size: 10px;
    font-style: normal;
    color: var(--muted);
    margin-left: 4px;
  }
  .range2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .note {
    margin: -6px 0 14px;
    font-size: 11px;
    color: var(--muted);
  }
  .note code {
    font-size: 10.5px;
  }
  .fonts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .font {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 10px 12px;
    text-align: left;
    background: var(--paper);
    border: 1px solid var(--faint);
    border-radius: 4px;
    transition: border-color 0.2s;
  }
  .font:hover {
    border-color: var(--muted);
  }
  .font.on {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .sample {
    font-size: 19px;
    color: var(--ink);
    white-space: nowrap;
  }
  .fname {
    font-size: 11px;
    color: var(--ink-soft);
  }
  .fname small {
    display: block;
    color: var(--muted);
  }
</style>
