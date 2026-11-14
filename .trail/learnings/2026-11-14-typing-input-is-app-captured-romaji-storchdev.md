---
title: "Typing input is app-captured romaji with block-on-mistake, per-kanji auto-conversion, and a single-line ticker scroll mode"
author: Storchdev
date: 2026-11-14
branch: main
cost: { minutes: 8, tokens: 60642 }
id: l-a457b988
scope: repo
status: active
src: agent
touches:
  - ".githooks/commit-msg"
  - AGENTS.md
  - CLAUDE.md
  - PLAN.md
---

## Decided
- Input: the app captures keydown and converts romaji itself, optimised for US/English keyboards; OS IME must be off (app shows a banner when it detects composition). Every common romanization is accepted.
- Mistakes: wrong key is rejected and counted as a miss (typing-game style), never entered; no backspace.
- Auto-conversion: per ruby group — a kanji shows as done as soon as its reading is typed; partial kana/romaji shown as a small composition at the caret.
- Scrolling mode = single-line ticker (caret fixed, text slides left); the other mode is a static wrapped paragraph.
- Hint: user setting full (romaji + Jitendex definition/pitch/example) / romaji only / off, placed unobtrusively under the current word.
- Delivery: local web app (Bun server on localhost), not Tauri/Electron.

## Tried and ruled out
- OS IME with auto-confirm: fragile across fcitx/ibus/macOS/Windows and fights the IME's own conversion.
- JIS kana-layout direct input: deferred, not v1.
- Allow-errors + backspace (monkeytype style): awkward with romaji ambiguity and multi-key kana, can desync.
- Per-whole-word conversion: less responsive than per ruby group.
- 3-line monkeytype-style scrolling window: user chose the ticker instead.
- Desktop wrapper: extra toolchain/weight for no gain.

## Watch out
- Animations must stay smooth: only transform/opacity, no layout reads per keystroke.

In the code:
- Full decisions table lives in PLAN.md; enforcement hook in .githooks/commit-msg.
