# AGENTS.md — weebtype

Instructions for any coding agent (Claude Code, Codex, …) working in this repo.
`CLAUDE.md` just imports this file; edit **this** one.

## What this is

A local Japanese typing test: LLM-generated sentences, romaji input with automatic
visual kana→kanji conversion (no IME, no space), and an always-available hint for the
current word. Full scope, decisions and progress: **[PLAN.md](PLAN.md)**. Read it first.

## Keeping docs current (enforced)

- **PLAN.md** — tick milestone items `[x]` in the same commit that finishes them; add new
  items when scope grows; record any new decision in the Decisions table; add a dated
  line to the Log for notable changes. Never silently diverge from a recorded decision —
  ask the user, then update the table.
- **AGENTS.md** — update when commands, layout, conventions, or gotchas change.
- A `commit-msg` hook (`.githooks/commit-msg`, installed by `bun install` via the
  `prepare` script → `git config core.hooksPath .githooks`) **rejects any commit that
  changes code/config without also staging PLAN.md or AGENTS.md**. Only for genuinely
  doc-irrelevant commits (typo fix, formatting) put `[skip-docs]` in the commit message.
  Don't use it to dodge the rule.

## Workflow

- Commit **often**: one logical step per commit, conventional-ish messages
  (`feat: romaji engine accepts xtu/ltu`). Commit on `main` unless told otherwise.
- Before every commit: `bun run check` (types) and `bun test` must pass.
- Keep logic that can be pure (romaji engine, session state, validation, stats) in
  framework-free TS modules with `bun test` tests. Svelte components stay thin.

## Tooling rules

- **Bun only** for JS/TS (`bun install`, `bun run`, `bun test`, `bunx`). No npm/yarn/pnpm.
- **uv only** if Python is ever needed (`uv run`, `uv add`). Prefer TS.
- TypeScript `strict` everywhere; no `any` without a comment explaining why.

## Commands

| Command                              | Does                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `bun install`                        | Install deps + git hooks                                                 |
| `bun dev`                            | Vite (5173, proxies `/api`) + `bun --watch` API server (6494)            |
| `bun start`                          | Build frontend, serve everything from Bun on 6494, open browser          |
| `bun run serve`                      | Serve existing `dist/` + API without rebuilding                          |
| `bun run check`                      | `tsc --noEmit` + `svelte-check --fail-on-warnings`                       |
| `bun test`                           | Unit tests (`tests/`)                                                    |
| `bun run lint` / `bun run format`    | Biome check / format                                                     |
| `bun run build:static`               | Server-less web build (Tatoeba only) → `dist-static/` + `weebtype-web.zip` for itch.io / static hosts |
| `bun run data:setup [--force]`       | Download Jitendex + Kanjium pitch, build `data/*.json` (auto-run by `bun start`/`bun dev` when `data/` is incomplete) |
| `bun scripts/screenshot.ts out.png …` | Headless Chromium screenshot of a running server (see flags in the file: `--offline`, `--builtin`, `--theme`, `--display`, `--font`, `--hint romaji|kana|off`, `--dict on|off`, `--type "keys"` + `--wait ms`, `--finish`, `--settings`, `--battle`) |

Visual changes: run the server (`bun run serve` after `vite build`), take screenshots with
the script and look at them before committing.

## Layout

```
server/            Bun.serve API (main.ts), LLM backends (llm.ts: claude/codex/llama-server), kuromoji readings for llama (analyzer.ts),
                   passages + prefetch (+ disk cache), variety,
                   normalisation, dictionary + vendored deinflect, Tatoeba fallback
src/lib/core/      framework-free TS: kana, romaji engine, session/stats, cells/words, pitch, chart ticks, Tatoeba sentence chunks, types
src/lib/ui/        Svelte components (TypingArea, DictPanel, Results, SettingsPanel, HistoryPanel,
                   PlumBranch, Petals, Battle)
src/lib/*.ts       settings (runes, localStorage), api client, staticPassages (web build), history, fonts, singer (offline-rendered voice), keysound,
                   layout (page geometry: branch, stage band, narrow breakpoint)
src/app.css        theme tokens (light/dark) + base styles
scripts/           dev runner, data setup (download + pure converters in build-data.ts), screenshot,
                   build-static (web build: pre-annotated Tatoeba chunks + zip)
tests/             bun tests for the core modules
public/sounds/     CC0 keyboard clicks (credited in README)
data/voice/        optional user-installed UTAU voicebank for the singer (never committed)
data/              dictionary/pitch/examples JSON (gitignored, built by data:setup); data/cache/ unused passages
```

## Conventions & gotchas

- Readings are **hiragana**, except katakana words keep katakana readings; the romaji
  engine treats both the same.
- Punctuation is a token whose reading is the character itself; the romaji engine maps
  keys (`,`→、 `.`→。 `[`→「 `]`→」 `-`→ー `?`→？ `!`→！).
- Animations: only `transform`/`opacity` (colour transitions on text are fine; never animate layout properties); never read layout inside the keystroke hot path
  except once per group change. Respect `prefers-reduced-motion`.
- All colours come from CSS custom properties defined per theme — no hard-coded colours
  in components or SVGs (use `currentColor` / `var(--…)`).
- `server/vendor/deinflect.js` is vendored from Yomitan (GPLv3) as plain JS with a hand-written
  `deinflect.d.ts` (only the API we use). Keep its license header; don't type-check the JS.
- `settings.backend` may be `"tatoeba"` (no-AI mode, `offlineOnly()`); `requestFor` still emits a valid
  `Backend` for the server, and `App.svelte` must route that mode to `fetchFallback`, never generate/prefetch.
- Only settings that change *what is generated* (backend, model, level, length, topic) belong in
  `requestFor`; anything in it triggers a reload on settings close. Hint/dictionary/display/font are view-only.
- Jitendex has no proper nouns. LLM passages carry `names` ({w, en}); `annotate` uses `nameEntry` only
  when the dictionary lookup misses (tag `"name"`).
- Passage variety comes from `server/variety.ts` (directions + recent-passage list in the prompt).
  Don't reintroduce a numeric "seed" in prompts — models ignore it.
- LLM CLIs run from an empty temp dir (so they don't read project instructions) with
  `--system-prompt … --tools "" --strict-mcp-config --setting-sources "" --no-session-persistence` (claude) /
  `-s read-only --ephemeral` (codex). The `llama` backend POSTs to llama-server's `/v1/chat/completions`
  (URL from the request's `endpoint`, else `WEEBTYPE_LLAMA_URL`, else `http://127.0.0.1:8080`).
- The `llama` backend is two-step: `COMPOSE_PROMPT` (plain `passage` + translations + names), then
  `analyze` (kuromoji/IPAdic, `server/analyzer.ts`) segments and reads it; only words kuromoji can't read go
  back to the model (`READINGS_PROMPT`). Number + counter and noun + suffix runs kuromoji reads piece by piece are
  joined and read from Jitendex (`Dictionary.writtenReadings`, passed in as `GenerateOptions.words`); `joinCountReadings`
  covers counts Jitendex lacks. Add irregular cases there, not as hard-coded words. Don't move local models back to the one-pass ruby-group schema —
  measured much worse (see PLAN decisions). `SYSTEM_PROMPT` is built from the same rule arrays and must stay
  byte-identical for claude/codex.
- Prompts are `{system, user}` (`buildPrompt`): `SYSTEM_PROMPT` must stay byte-identical across requests
  (it is the cached prefix) — put anything per-request (level, length, variety, recents) in `user`.
- Untyped passages persist to `data/cache/passages.json` (`PassageService(cacheFile)`; tests pass
  none). Served passages are leased: App calls `consumePassage` on TypingArea's `onstart` and
  `releasePassage` (beacon) when leaving an untyped AI passage — keep that pairing if you add new ways to load one. Bump `CACHE_VERSION` in `server/passages.ts` if the `Passage` shape changes incompatibly.
- Static web build (`__STATIC__`, from `vite --mode static`; declared in `src/env.d.ts`): no server, so every
  `/api` call in `src/lib/api.ts`/`singer.ts` must short-circuit on `__STATIC__` (write it as a ternary or early
  return so Rollup drops the fetch). Asset URLs use `import.meta.env.BASE_URL` (the build is served from a
  subpath), never a leading `/`. `__STATIC__` is not defined under `bun test`, so keep it out of tested modules.
  Sentence chunk format + passage assembly live in `core/sentences.ts`, shared with `server/tatoeba.ts`.
- The web build gets fonts from Google Fonts (`googleFonts()` in `vite.config.ts`, replaces every `@fontsource/*`
  import): itch.io allows ≤ 1,000 files and fontsource is ~2,900. Keep its family list in sync with `src/lib/fonts.ts`.
- Don't `pkill -f "bun server/main.ts"` from an agent shell — the pattern matches the shell itself.
- `data/` is built only from public sources (Jitendex Yomitan zip, Kanjium `accents.txt`) by
  `scripts/setup-data.ts`; never make setup depend on a local path. Formats are documented in
  `scripts/build-data.ts` and must stay what `server/dictionary.ts` reads.
- Biome lints `.svelte` files without seeing the template, so unused-import/variable and
  `useConst` rules are off for `*.svelte` (in `biome.json`). Don't remove "unused" imports there by hand.
- Buttons use the shared classes in `app.css`: `.tbtn` (text button, accent hairline underline
  on hover, solid when `.on`) and `.pbtn` (the one solid primary action). No pill/oval outlines;
  radii ≤ 4px. Don't restyle buttons per component.
- Battle mode: `TypingArea` reports newly completed kana via `onkana`; `Battle.svelte` creates
  projectiles imperatively (WAAPI, transform/opacity) and only measures screen positions on
  mount/resize/new run — keep it that way. The voice is synthesized (`singer.ts` + pure
  `core/voice.ts`, melody from `accentMelody` in `core/accent.ts`, which indexes the session target char-for-char); don't add character art or voice samples from existing franchises.
- Voicebanks: `oto.ini`/`character.txt` are usually Shift-JIS (`server/voicebank.ts` decodes);
  aliases may carry pitch/expression suffixes (`- かA4`, `a かS`) — `baseAlias` strips them.
  Pitch-suffixed/note-named folders are kept as pitch sets (`pitchTag`), other suffixes
  (S/W expressions) are dropped; `OtoIndex.find(s, targetHz, mainHz)` picks the nearest set.
  Long vowels (せい sung "see", じゅう "juu") are held **only inside one kanji's reading**
  (`longVowelMask`, passed by Battle to `sing`); elsewhere vowels are sung as written. ー always holds.
  Morae that continue a vowel — diphthong second halves (たい, こえ), ん after a vowel (`Syllable.from`)
  and long-vowel holds — use the bank's VCV transition (`a い`, `a ん`, `u う`) with a soft entry, and
  fade out the previous note instead of re-attacking.
- Singer notes are absolute semitones from A4 (`accentMelody`, major pentatonic of the user's lowest note; range from settings `voiceLow`/`voiceHigh`). `Singer.play` makes a
  new `Audio` per note from a cached blob URL so notes overlap — don't go back to one shared element.
- Sound is **only** played via `<audio>` elements (files or rendered WAV blobs). Don't connect
  live Web Audio to `ctx.destination` — it was silent on the user's Chromium/PipeWire.
- Typing text renders as one `.cell` per kana/punct char or kanji group, wrapped in nowrap
  `.word` spans (`buildWords`) so lines break only between words.
- Page geometry lives in `src/lib/layout.ts`; App writes it to `:root` CSS vars (`--branch-w/h`,
  `--main-top`, `--stage-h`, `--stage-bottom`) and passes `reserveTop`/`reserveBottom` to TypingArea's
  line count. Don't hard-code those formulas in CSS or components again. The battle band is reserved
  with `margin-bottom` on main (padding would let scrolled content run under the stage).
- Touch devices (`pointer: coarse`) type through a hidden `<input class="soft">` in TypingArea;
  its `input` events go through the same `press()` as window keydowns. Phones have no Tab/Esc,
  so the narrow footer shows restart/new-passage buttons.
