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
| Dictionary        | Reuse 10ff-yomitan data (Jitendex `dictionary.json`, `pitch.json`, `examples.json`) + port of Yomitan deinflector to TS. Data lives in `data/` (gitignored, ~65 MB), imported by `bun run data:import <path>`. Lookups happen **server-side**; the client only receives per-token annotations                              | Don't ship 65 MB to the browser                                                        |
| Licensing         | Vendored Yomitan deinflector is GPLv3 → project is **GPLv3**. Jitendex data is CC BY-SA (attribution in README/about)                                                                                                                                                                                                      |                                                                                        |
| LLM latency       | Server keeps a **prefetch queue** (default 2 passages per settings key) so "next test" is instant. Offline/failed LLM → fallback passages built from Tatoeba sentences in `examples.json` (already furigana-segmented)                                                                                                     | `claude -p` takes several seconds                                                      |
| LLM backends      | `claude -p --output-format json --json-schema … --tools ""` and `codex exec --output-schema <file> -o <file> --ephemeral --skip-git-repo-check -s read-only`. Backend + model are user settings                                                                                                                            | Both CLIs support structured output                                                    |
| Difficulty        | Vocabulary level: JLPT **N5, N4, N3, N2, N1**, plus **Native** (literary/news). Optional free-text topic                                                                                                                                                                                                                   |                                                                                        |
| Length            | Approximate target in kana-to-type: presets 50 / 100 / 200 / 400 + custom                                                                                                                                                                                                                                                  | User: "approximately"                                                                  |
| Display modes     | **Paragraph** (static, wrapped) or **Ticker** (single line, caret fixed ~40% across, text slides left)                                                                                                                                                                                                                     | User choice                                                                            |
| Themes            | Light + dark (+ "system"). All colours are CSS custom properties; decorations use them too                                                                                                                                                                                                                                 |                                                                                        |
| Fonts             | Self-hosted via `@fontsource/*` (offline-safe): Noto Sans JP, Noto Serif JP, Klee One, plus contrasting: Zen Maru Gothic (rounded), Shippori Mincho (elegant mincho), M PLUS 1 Code (mono-ish), Yuji Syuku (brush, decorative), Dela Gothic One (heavy display)                                                            | User wants noto sans/serif + Klee One + contrasting                                    |
| Aesthetic         | Minimal, washi-paper feel. Hand-authored **SVG** plum-blossom (梅) branch in a corner + optional slow drifting petals (toggleable, off under `prefers-reduced-motion`). Colours via theme tokens so it works in light and dark                                                                                             |                                                                                        |
| Animations        | Must be smooth: animate **only `transform`/`opacity`**, caret glides via `transform` with short easing, ticker uses `translate3d`, no layout thrash per keystroke (measure once per group change, cache rects), `will-change` only on moving elements, 60 fps target, respects `prefers-reduced-motion`                    | User: "make sure the animations are smooth"                                            |
| Stats             | Kana/min (KPM, primary), keystrokes/min, accuracy (correct keys / all keys), misses per word, time. History in `localStorage`                                                                                                                                                                                              | KPM is the usual JP typing metric                                                      |
| Persistence       | Settings + history in `localStorage`                                                                                                                                                                                                                                                                                       | Single-user local app                                                                  |
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
- [x] Settings UI: backend, model, level, length, topic

### M3 — Dictionary + hints

- [x] `data:import` script; compact server-side index; TS port of Yomitan deinflector (GPLv3 header kept)
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

## Open questions / later

- JIS kana-layout direct input (not planned for v1)
- Tategaki (vertical) display mode?
- Furigana-over-kanji toggle on the target text for beginners?

## Log

- 2026-11-14 — Layout pass from feedback: main content starts below the branch's lowest blossom (`--branch-w/--branch-h` shared CSS vars, `justify-content: safe center`, paragraph line count adapts to window height); progress is a full-width rule with stats above; dictionary card → in-page DictPanel; `kana` hint mode. Tatoeba: adjacent ruby segments merge into one word (彼|女 → 彼女); bare-kanji tokens look up their okurigana (歩|いて → 歩く) and the kana token shares the entry; kana tokens prefer the entry spelled in kana (の particle, not 野).

- 2026-11-14 — Verified end to end: live `claude` (sonnet) passage in ~7–17 s cold, 0.2 s from prefetch; headless typing at full speed holds 16.7 ms frames (p99 16.8 ms, 0 dropped) in paragraph, ticker and reduced-motion. Vite/API pinned to 127.0.0.1 (Vite's `localhost` bound IPv6 only). README + GPLv3 LICENSE added.

- 2026-11-14 — Frontend v1: Svelte 5 typing view (per-cell inline-blocks grouped into unbreakable words so lines wrap between words and never start with 、。), caret/composition/hint all positioned with transform. Hint split: romaji+reading guide sits in the line gap under the current word; Jitendex card sits *below the text block* (follows the word horizontally) so it never covers text. `scripts/screenshot.ts` for headless visual checks.

- 2026-11-14 — Server done: claude/codex structured output, okurigana splitting, dictionary validation (all deinflection candidates, e.g. 行った → 行く+行う), prefetch queue, Tatoeba fallback (~21k sentences). Dictionary uses ~400 MB RSS and ~0.6 s to load.

- 2026-11-13 — Project kicked off; decisions table settled with the user.
