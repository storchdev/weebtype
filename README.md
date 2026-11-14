# weebtype 和文タイピング

A local Japanese typing test. It gives you real sentences (written fresh by `claude -p` or
`codex exec` on your machine) and you type them in romaji on a normal US keyboard. No
IME and no space bar: each kana or kanji group converts as soon as you finish typing it.
A small guide under the current word always shows how to type it. Turn on the full hint
and a dictionary card (meaning, pitch accent and an example) also follows the word.

## Setup

Requirements: [Bun](https://bun.sh) ≥ 1.2, and at least one of the
[`claude`](https://docs.claude.com/en/docs/claude-code) or `codex` CLIs, logged in.
Without either CLI it still works, using Tatoeba sentences offline.

```sh
bun install                 # deps + git hooks
bun run data:import <dir>   # Jitendex/pitch/examples JSON from a 10ff-yomitan-style dir
bun start                   # build, serve on http://127.0.0.1:5174 and open the browser
```

Use `bun dev` for development (Vite on 5173 with hot reload, API on 5174).
`bun run check`, `bun test` and `bun run lint` must pass before you commit. See
[AGENTS.md](AGENTS.md) and [PLAN.md](PLAN.md).

## Typing

- Type romaji: `ka`, `shi`/`si`, `kya`, `nn`/`n'`, double consonants for っ (or `xtu`/`ltu`).
- Punctuation: `,`→、 `.`→。 `[`→「 `]`→」 `-`→ー `?`→？ `!`→！
- A wrong key is blocked and counted as a miss.
- <kbd>Tab</kbd> restarts, <kbd>Shift</kbd>+<kbd>Tab</kbd> loads a new passage, <kbd>Esc</kbd> opens settings (or goes back), and on the results screen <kbd>Enter</kbd> starts the next passage.

Settings: generator and model, vocabulary level (JLPT N5–N1, or native), approximate length
in kana, topic, hint mode (romaji + meaning / romaji / kana only / off), paragraph or scrolling-line
layout, light/dark/auto theme, font and size, falling petals.

History (記録) is kept in the browser's localStorage; export it to a JSON file and import
it elsewhere (imports merge, duplicates are skipped).

## License & attribution

weebtype is licensed under the **GNU GPL v3 or later** (see [LICENSE](LICENSE)). It includes
the deinflection rules from [Yomitan](https://github.com/yomidevs/yomitan) (GPLv3) in
`server/vendor/deinflect.js`, and its pitch-accent mora logic is ported from Yomitan.

The dictionary data is not in this repo. Imported data comes from:

- [Jitendex](https://jitendex.org) — CC BY-SA 4.0, based on JMdict
  ([EDRDG licence](https://www.edrdg.org/edrdg/licence.html)).
- Example and fallback sentences from [Tatoeba](https://tatoeba.org) — CC BY 2.0 FR.

Fonts (Noto Sans/Serif JP, Klee One, Zen Maru Gothic, Shippori Mincho, M PLUS 1 Code,
Yuji Syuku, Dela Gothic One) are bundled through Fontsource under the SIL Open Font License.
