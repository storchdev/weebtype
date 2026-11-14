# weebtype — Plan

A Japanese typing test that serves **real sentences/phrases** (generated locally by
`claude -p` or `codex exec`), auto-converts kana → kanji visually as you type (no space
bar / IME), and always shows an unobtrusive hint for the current word.

> This file is the source of truth for scope, decisions, and progress.
> Keep it current — see AGENTS.md § "Keeping docs current".

---

## Decisions (settled — don't re-litigate without the user)

| Topic             | Decision                                                                                                                                                                                                                                                                                                                   | Why                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Delivery          | Local web app: `bun start` → Bun server on localhost, opens browser                                                                                                                                                                                                                                                        | Simplest; browser renders ruby + web fonts best; server can spawn CLIs                 |
| Runtime / pkg mgr | **Bun** (no npm/node scripts). Python only if ever needed, via **uv**                                                                                                                                                                                                                                                      | User requirement                                                                       |
| Language          | **TypeScript, strict**, everywhere. `bun run check` = `tsc` + `svelte-check` must pass                                                                                                                                                                                                                                     | User requirement: type checked                                                         |
| Frontend          | **Svelte 5** (runes) + Vite                                                                                                                                                                                                                                                                                                | Fine-grained reactivity for per-keystroke updates without VDOM churn; small output     |
| Backend           | `Bun.serve` with a tiny typed JSON API; serves the built frontend in prod, Vite proxies to it in dev                                                                                                                                                                                                                       | One process, no framework needed                                                       |
| Keyboard          | **Optimised for English/US layout, romaji input**. App captures `keydown` itself; OS IME must be **off** (app detects `isComposing`/`Process` keys and shows a banner telling the user to switch it off)                                                                                                                   | Most reliable; no IME conversion fights. JIS kana layout is out of scope (maybe later) |
| Romaji            | Accept **every** common romanization (shi/si, chi/ti, tsu/tu, fu/hu, ji/zi/di, ja/jya/zya, n/nn/n', xtu/ltu/double-consonant っ, xya/lya small kana, wo, `-`→ー, `,`→、 `.`→。 `[`→「 `]`→」 `?`→？ `!`→！). Ambiguity resolved like typing games: keep a set of live candidate paths through the target kana              | Standard approach (寿司打 etc.)                                                        |
| Mistakes          | **Block + count**: a wrong key is rejected (flash red, miss counter++), never entered. No backspace needed                                                                                                                                                                                                                 | Can never desync from target kana                                                      |
| Auto-conversion   | **Per ruby group.** Passage = tokens (words) → ruby groups (`{text:"食", reading:"た"}`, `{text:"べる", reading:"べる"}`). A group is shown as "done" (its real kanji/kana) the moment its reading is fully typed. While partway through a group, the typed kana + pending romaji show as a small composition at the caret | Feels like instant conversion                                                          |
| Hint | Setting with 4 modes: **full** (kana + romaji guide + dictionary panel), **romaji** (kana + romaji), **kana** (reading only), **off**. The guide is small text in the line gap under the current word (next key underlined). The dictionary panel is laid out on the page below the text (no floating card): a hairline rule whose accent marker slides to point at the current word, headword + pitch on the left, senses + example on the right. | User request: "natural and unobtrusive"; v1 floating card read as "an afterthought" |
| Readings source   | LLM returns segmented tokens with ruby-group readings (JSON schema enforced). Server **validates** each token against the dictionary (+ deinflection); invalid passages are repaired/retried once, then dropped                                                                                                            | LLM readings are usually right; dictionary catches mistakes                            |
| Dictionary        | Reuse 10ff-yomitan data (Jitendex `dictionary.json`, `pitch.json`, `examples.json`) + port of Yomitan deinflector to TS. Data lives in `data/` (gitignored, ~65 MB), built from public Jitendex + Kanjium downloads by `bun run data:setup` (auto-run on first `bun start`/`bun dev`). Lookups happen **server-side**; the client only receives per-token annotations                              | Don't ship 65 MB to the browser                                                        |
| Licensing         | Vendored Yomitan deinflector is GPLv3 → project is **GPLv3**. Jitendex data is CC BY-SA (attribution in README/about)                                                                                                                                                                                                      |                                                                                        |
| LLM latency       | Server keeps a **prefetch queue** (default 2 passages per settings key) so "next test" is instant. Offline/failed LLM → fallback passages built from Tatoeba sentences in `examples.json` (already furigana-segmented)                                                                                                     | `claude -p` takes several seconds                                                      |
| LLM backends      | `claude -p --output-format json --json-schema … --tools ""` and `codex exec --output-schema <file> -o <file> --ephemeral --skip-git-repo-check -s read-only`. Backend + model are user settings                                                                                                                            | Both CLIs support structured output                                                    |
| Difficulty        | Vocabulary level: JLPT **N5, N4, N3, N2, N1**, plus **Native** (literary/news). Optional free-text topic                                                                                                                                                                                                                   |                                                                                        |
| Passage variety   | Server picks subject × form × narrator × tone from shuffle bags (`server/variety.ts`) and lists the last 8 subjects/openings in the prompt; no numeric seed | A seed number in the prompt is ignored by the model, so passages converged on the same few topics |
| Length            | Approximate target in kana-to-type: presets 50 / 100 / 200 / 400 + custom                                                                                                                                                                                                                                                  | User: "approximately"                                                                  |
| Display modes     | **Paragraph** (static, wrapped) or **Ticker** (single line, caret fixed ~40% across, text slides left)                                                                                                                                                                                                                     | User choice                                                                            |
| Themes            | Light + dark (+ "system"). All colours are CSS custom properties; decorations use them too                                                                                                                                                                                                                                 |                                                                                        |
| Fonts             | Self-hosted via `@fontsource/*` (offline-safe): Noto Sans JP, Noto Serif JP, Klee One, plus contrasting: Zen Maru Gothic (rounded), Shippori Mincho (elegant mincho), M PLUS 1 Code (mono-ish), Yuji Syuku (brush, decorative), Dela Gothic One (heavy display)                                                            | User wants noto sans/serif + Klee One + contrasting                                    |
| Aesthetic         | Minimal, washi-paper feel. Hand-authored **SVG** plum-blossom (梅) branch in a corner + optional slow drifting petals (toggleable, off under `prefers-reduced-motion`). Colours via theme tokens so it works in light and dark                                                                                             |                                                                                        |
| Animations        | Must be smooth: animate **only `transform`/`opacity`**, caret glides via `transform` with short easing, ticker uses `translate3d`, no layout thrash per keystroke (measure once per group change, cache rects), `will-change` only on moving elements, 60 fps target, respects `prefers-reduced-motion`                    | User: "make sure the animations are smooth"                                            |
| Stats             | Kana/min (KPM, primary), keystrokes/min, accuracy (correct keys / all keys), misses per word, time. History in `localStorage`                                                                                                                                                                                              | KPM is the usual JP typing metric                                                      |
| Persistence       | Settings + history in `localStorage`                                                                                                                                                                                                                                                                                       | Single-user local app                                                                  |
| Battle mode | Opt-in (`battle`, off by default): an **original** chibi singer (plum-pink buns, kimono, headset — not an existing character) sings each typed kana, which flies spinning into a marshmallow boss whose HP = passage kana (0 at the end, 撃破 stamp). Voice is a **Web Audio formant synth** (vowel formants + consonant noise, melody follows the passage's **Tokyo pitch accent** (`core/accent.ts`: Kanjium downsteps adjusted for conjugation, particles continue the phrase, です/ます own drops, catathesis); the pentatonic random walk is only the fallback), volume setting; no samples | Fun to watch while typing. Real vocaloid voicebanks/character art can't be shipped; a synth keeps it self-contained |
| Singer voicebank | The user may put any UTAU CV/VCV voicebank in `data/voice/` (gitignored, symlinks ok; never bundled). Server loads every **pitch set** (pitch suffix like `A4` or a folder ending in a note name; the untagged set's pitch is measured on its あ) and drops other expressions (Strong/Whisper suffixes). Client picks, per note, the `- か`-style sample from the set recorded nearest the target, trims any breath more than 110 ms before the vowel, and resamples it (small shift). Falls back to the formant synth | No permissively licensed voicebank to ship; resampling one low set far up sounded low and breathy |
| Battle stage | Singer and boss stand in a **band along the bottom** (height from `layout.ts`), kana fly nearly level inside it; the dictionary panel stays under the text. Moving the panel sideways was rejected as unbalanced | User: arcs crossed the text; characters too small |
| Singer melody | Notes are **absolute** pitches in the **major pentatonic of the lowest note** of a user-set range (default D4–E5, settings Range): `accentMelody` keeps every accent rise/drop (high = phrase top, phrase-initial low one step under, drop two under) while phrase tops walk gently downward from the sentence start. Notes are **polyphonic** (new `<audio>` per note from a cached blob URL, ≤6 ringing), so fast typing doesn't cut them off | User: raw accent semitones around the bank's pitch "didn't sound like real pitches"; monophonic playback cut notes short |
| Audio output | All sound plays through `<audio>` elements: key clicks are CC0 WAVs in `public/sounds/keys/`; each sung note is rendered with an `OfflineAudioContext` to a cached WAV blob. Never output live Web Audio (`ctx.destination` or a MediaStreamDestination) | On the user's Chromium + PipeWire setup live Web Audio was silent (context running, signal measured) while file-backed media elements play |
| Tests             | `bun test` for pure logic (romaji engine, passage validation, deinflect lookup, stats)                                                                                                                                                                                                                                     |                                                                                        |

## Data shapes

```ts
// Generated by the LLM (enforced by JSON schema), then validated server-side
type Passage = { id: string; level: Level; tokens: Token[] };
type Token = {
  groups: RubyGroup[]; // e.g. [{t:"食",r:"た"},{t:"べる",r:"べる"}]
  // filled in server-side:
  dict?: DictHint; // lemma, reading, pitch, defs, example (for "full" hint)
};
type RubyGroup = { t: string; r: string }; // r = hiragana reading (katakana kept as katakana)
// Punctuation is its own token with r = the character itself, e.g. {t:"。",r:"。"}
```

## Milestones

Mark `[x]` when done **in the same commit** that finishes the item.

### M0 — Project setup

- [x] AGENTS.md + PLAN.md, CLAUDE.md → AGENTS.md
- [x] Git hook enforcing docs updates (`.githooks/commit-msg`), installed by `bun install`
- [x] Bun + Vite + Svelte 5 + TS strict scaffold; `bun run check`, `bun test`, `bun dev`, `bun start`
- [x] Biome (lint + format)

### M1 — Typing core (no LLM yet, hardcoded passage)

- [x] Romaji engine: kana → candidate romaji trie, accepts all variants, `n` ambiguity, っ, small kana, punctuation (pure TS, heavily tested)
- [x] Session state machine: tokens → groups → kana, per-key accept/reject, caret position, per-group completion
- [x] Paragraph view with per-group auto-conversion + caret composition (typed kana + pending romaji)
- [x] IME-on detection banner
- [x] Results screen: KPM, keys/min, accuracy, time, misses

### M2 — LLM generation

- [x] Prompt + JSON schema; `claude -p` and `codex exec` backends with timeout + error reporting
- [x] Server-side normalisation (katakana/hiragana readings, punctuation tokens, length trimming)
- [x] Prefetch queue keyed by (backend, model, level, length, topic)
- [x] Real passage variety: shuffle-bag directions + recent-passage avoidance (no fake seed)
- [x] Settings UI: backend, model, level, length, topic

### M3 — Dictionary + hints

- [x] `data:setup` script (downloads public Jitendex + Kanjium, builds `data/`); compact server-side index; TS port of Yomitan deinflector (GPLv3 header kept)
- [x] Validate LLM readings against dictionary; repair/retry
- [x] Hint card (full / romaji / off), anchored under current word, smooth follow
- [x] Tatoeba fallback passages

### M4 — Look & feel

- [x] Theme tokens, light/dark/system toggle
- [x] Fonts (fontsource) + font picker + font-size slider, live preview
- [x] Ticker mode
- [x] SVG plum-blossom decoration + optional petals; checked in both themes
- [x] Animation pass: caret glide, group-complete fade, ticker slide, hint follow; profile for 60 fps
- [x] `prefers-reduced-motion` support

### M5 — Polish

- [x] History view
- [x] Keyboard shortcuts (Tab = restart, Esc = settings, Enter on results = next)
- [x] README with setup, licensing/attribution

### M6 — Extras

- [x] Singer pitch follows pitch accent (`core/accent.ts`: phrase contour per target char)
- [x] Optional UTAU voicebank for the singer (`data/voice/`, `core/oto.ts`, `server/voicebank.ts`): sample per kana, resampled to the accent pitch
- [x] Singer sounds sung: accent melody snapped to a key, nearest-pitch-set samples, polyphonic notes, breath trimmed
- [x] Generator option `tatoeba` (no AI): passages only from offline Tatoeba sentences; Model/Topic hidden, no prefetch
- [x] Keyboard sounds (opt-in, volume): random CC0 keystroke per key, duller on misses (`keysound.ts`)
- [x] Battle mode: singer → flying kana → marshmallow boss HP bar; formant-synth voice + volume (`Battle.svelte`, `singer.ts`, `core/voice.ts`)

### M7 — Feedback round (2026-11-14)

- [x] Romaji: every phonetic spelling of a kana pair works without x/l (ディ `di`, トゥ `tu`, ぢゃ `ja`, いぇ `ye`, ぢ `ji`, づ `zu`, を `o`…)
- [x] Singer: long vowels (じゅう, きょう, とおい, ー) glide on as one held syllable instead of re-attacking a new `u`
- [x] Singer: voice range setting (lowest/highest note); default a bit lower than F4–G5
- [x] Battle: singer and boss larger; kana fly a low, nearly straight path so they don't cross the text
- [x] Battle layout: a stage band along the bottom (`--stage-h`, `src/lib/layout.ts`); the text/dictionary reserve it, the branch shrinks, results get a smaller band and scroll above it
- [x] Mobile: narrow layout (≤ 640 px: no branch, stacked dictionary, font capped by width, footer buttons) and a hidden input for the on-screen keyboard
- [x] Passage trimming keeps a closing 」 after 。 and never cuts inside a quote
- [ ] Later: particle は sung as "wa" (and へ as "e")

## Open questions / later

- JIS kana-layout direct input (not planned for v1)
- Tategaki (vertical) display mode?
- Furigana-over-kanji toggle on the target text for beginners?

## Log

- 2026-11-14 — Tried holding the first mora of たい/さん/じゅう silent until the second was typed; user asked to revert it (each mora sounds as typed; the second glides via VCV).

- 2026-11-14 — Singer fuses diphthongs (たい, こえ) and ん with the vowel before them via VCV transition samples; long-vowel holds use them too (no breathy "- う" re-attack).

- 2026-11-14 — Battle stage band (bigger characters, flat kana flights, no overlap with text/results), shared `layout.ts` geometry, phone layout + on-screen keyboard input.
- 2026-11-14 — Fix: passages ending in 「…。」 lost the final 」 (trimToLength cut right after 。); it now cuts only outside quotes. Singer holds long vowels (じゅう, せい, ー) as one glide.
- 2026-11-14 — Singer fixes after "not lyrical, cut off, low and breathy": `accentMelody` (F major pentatonic, absolute notes, accent shape kept), voicebank pitch sets (Kumi: D4 core + A3/A4/D5; Strong/Whisper excluded) chosen per note, rendered notes within ~0.4 st of target, notes ring ~0.4 s and overlap (≤6), consonant lead capped at 110 ms.

- 2026-11-14 — Settings → Generator gains `tatoeba` (no AI): loads via `/api/fallback` only, never `/api/passage`/`/api/prefetch`, even when claude/codex are installed.
- 2026-11-14 — Singer can use a user-installed UTAU voicebank (`data/voice/`, Shift-JIS oto.ini, pitch/expression suffixes stripped, plain set preferred); settings show which voice is active. Tested with 筆音クミ Act 4 (VCV, 75/75 kana covered).
- 2026-11-13 — Singer sings the pitch accent: per-char contour from Kanjium downsteps (dictionary value; ichidan te/ta forms shift back a mora, godan keep it; ます/ません on ま/せ; ない on the mora before な; adjective かった/くて −1; special morae can't hold the nucleus), particles keep high after heiban / low after a drop, です etc. drop only if nothing dropped, unknown katakana words antepenultimate, catathesis per accented phrase reset at 。！？.
- 2026-11-13 — Keyboard sounds setting (CC0 clicks via `<audio>`). Singer no longer outputs live Web Audio: notes are rendered offline to WAV blobs (`core/wav.ts`) and played by `<audio>`, because live Web Audio was silent on the user's machine.
- 2026-11-13 — Battle voice: one shared AudioContext (resumed if created suspended), settings preview sings ら・ら・ら on toggling the mode or releasing the Voice slider, max gain lowered so 100% no longer clips; dropped the description under the toggle.
- 2026-11-13 — Battle mode (opt-in, 遊び section of settings): kana fly from an original singer to a marshmallow boss (HP = passage, expressions: normal / worried ≤30% / ouch on hit / KO with crown knocked off + 撃破 stamp, stays KO'd on results, bounces back on the next run). Voice is synthesized per kana (formants per vowel, noise per consonant class, ー holds the note, っ cuts it, punctuation resolves the melody). Animations are WAAPI on transform/opacity; positions measured on mount/resize/run only.
- 2026-11-14 — Setup no longer needs a local 10ff-yomitan copy: `bun run data:setup` downloads Jitendex (Yomitan zip) and Kanjium `accents.txt` and builds `dictionary.json`/`examples.json`/`pitch.json` itself (verified identical to the old files, modulo newer Jitendex). `bun start`/`bun dev` run it automatically when `data/` is incomplete and carry on without hints if offline. `data:import` removed.
- 2026-11-14 — Fixed: switching hint mode reloaded the passage (the request carried an unused `dict` flag, so it changed the generation key). Passages always carry dictionary entries; hint is display-only. Loader for a replacement passage now overlays the dimmed text instead of sitting below the panel space (was pushed off-screen).

- 2026-11-14 — Dictionary panel text enlarged: reading 14px, definitions 16px, other senses 14px, example 15px / translation 14px, deinflection 13px (headword unchanged).

- 2026-11-14 — Results stats use the history page's unit style (number + small muted unit): 100.0 %, 2217 打/分, 4.5 秒 / 1分05秒; chart axis in 秒.

- 2026-11-14 — Fixed near-identical passages: replaced the ignored `variety seed N` with server-picked directions (130+ subjects, 12 forms, narrators, tones; shuffle bags) and a recent-subjects/openings avoid list; banned stock openings. Live check: 4 N4 passages (2 parallel) all distinct. Results/history labels are lowercase now.

- 2026-11-14 — Logo seal (打) animates: hover straightens/lifts it, press stamps it down with a springy release, each click leaves an expanding ink ring (transform/opacity only).

- 2026-11-14 — Dropped pill/oval outlined buttons everywhere (nav, settings segments, history tools, results) for shared `.tbtn` underline text buttons + a squared `.pbtn` primary; radii tightened to 4px.

- 2026-11-14 — <kbd>Shift+Tab</kbd> = new passage (Tab = retry same, Enter on results = next). History: export to JSON (`{format: "weebtype-history", version: 1, entries}`), import merges (dedupe on timestamp+speed, invalid rows skipped, bare arrays accepted), two-click inline clear; cap raised to 2000 entries.

- 2026-11-14 — Dictionary panel: dropped the uppercase tag line; part of speech is now a printed-dictionary italic abbreviation (*n.*, *v.*, *adj.*…) leading the definitions, other Jitendex tags are not shown.

- 2026-11-14 — Results page redesign below the chart: gradient speed chart with time axis + labelled average, then a two-column review (passage with missed words underlined + translation | tricky-word rows) using the same small-caps labels and hairlines as the stats and dictionary panel; buttons match the UI scale.

- 2026-11-14 — Layout pass from feedback: main content starts below the branch's lowest blossom (`--branch-w/--branch-h` shared CSS vars, `justify-content: safe center`, paragraph line count adapts to window height); progress is a full-width rule with stats above; dictionary card → in-page DictPanel; `kana` hint mode. Tatoeba: adjacent ruby segments merge into one word (彼|女 → 彼女); bare-kanji tokens look up their okurigana (歩|いて → 歩く) and the kana token shares the entry; kana tokens prefer the entry spelled in kana (の particle, not 野).

- 2026-11-14 — Verified end to end: live `claude` (sonnet) passage in ~7–17 s cold, 0.2 s from prefetch; headless typing at full speed holds 16.7 ms frames (p99 16.8 ms, 0 dropped) in paragraph, ticker and reduced-motion. Vite/API pinned to 127.0.0.1 (Vite's `localhost` bound IPv6 only). README + GPLv3 LICENSE added.

- 2026-11-14 — Frontend v1: Svelte 5 typing view (per-cell inline-blocks grouped into unbreakable words so lines wrap between words and never start with 、。), caret/composition/hint all positioned with transform. Hint split: romaji+reading guide sits in the line gap under the current word; Jitendex card sits *below the text block* (follows the word horizontally) so it never covers text. `scripts/screenshot.ts` for headless visual checks.

- 2026-11-14 — Server done: claude/codex structured output, okurigana splitting, dictionary validation (all deinflection candidates, e.g. 行った → 行く+行う), prefetch queue, Tatoeba fallback (~21k sentences). Dictionary uses ~400 MB RSS and ~0.6 s to load.

- 2026-11-13 — Project kicked off; decisions table settled with the user.
