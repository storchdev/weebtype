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

(Fill in / correct as the scaffold lands.)

| Command                     | Does                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| `bun install`               | Install deps + git hooks                                              |
| `bun dev`                   | Vite dev server + Bun API server with reload                          |
| `bun start`                 | Build frontend, serve everything from Bun, open browser               |
| `bun run check`             | `tsc --noEmit` + `svelte-check`                                       |
| `bun test`                  | Unit tests                                                            |
| `bun run data:import <dir>` | Copy/compact Jitendex data from a 10ff-yomitan-style dir into `data/` |

## Layout (planned — update when it changes)

```
server/        Bun.serve API, LLM backends, prefetch queue, dictionary + deinflect
src/lib/core/  framework-free TS: romaji engine, session, stats, types shared with server
src/lib/ui/    Svelte components
src/assets/    SVG decorations
data/          Jitendex JSON (gitignored, imported)
```

## Conventions & gotchas

- Readings are **hiragana**, except katakana words keep katakana readings; the romaji
  engine treats both the same.
- Punctuation is a token whose reading is the character itself; the romaji engine maps
  keys (`,`→、 `.`→。 `[`→「 `]`→」 `-`→ー `?`→？ `!`→！).
- Animations: only `transform`/`opacity`; never read layout inside the keystroke hot path
  except once per group change. Respect `prefers-reduced-motion`.
- All colours come from CSS custom properties defined per theme — no hard-coded colours
  in components or SVGs (use `currentColor` / `var(--…)`).
- `src/…/deinflect` is vendored from Yomitan (GPLv3): keep its license header.
- The reference implementation for the dictionary hint lives at
  `/home/hudson/Desktop/japanslop/10ff-yomitan` (content.js, deinflect.js).
