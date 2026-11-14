---
title: "All app sound goes through audio elements, never live Web Audio output"
author: Storchdev
date: 2026-11-14
branch: main
cost: { minutes: 22, tokens: 145524 }
id: l-395e1e67
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - PLAN.md
  - README.md
  - public/sounds/keys/key-01.wav
  - public/sounds/keys/key-02.wav
  - public/sounds/keys/key-03.wav
  - public/sounds/keys/key-04.wav
  - public/sounds/keys/key-05.wav
  - public/sounds/keys/key-06.wav
  - public/sounds/keys/key-07.wav
---

## Decided
Every sound plays through `<audio>` elements. Key clicks are WAV files. Each sung note is rendered offline to a WAV blob, cached per syllable and pitch, then played.

## Tried and ruled out
- A live AudioContext connected to ctx.destination was silent on the user's Chromium + PipeWire (HDMI monitor sink). This was confirmed even though: the context reported running, an analyser measured peaks up to 0.66, and other tabs played sound.
- Resuming the context did not help.
- An inaudible keep-alive noise did not help.
- Routing through a MediaStreamDestination into an `<audio>` element was also silent.
- File-backed `<audio>` did play, and WAVs rendered offline played via pw-play.

## Watch out
Don't "simplify" the singer back to live Web Audio. Headless Chromium plays it fine, so tests won't catch the regression.

In the code: src/lib/singer.ts (renderSyllable + Singer.play), src/lib/core/wav.ts, src/lib/keysound.ts.
