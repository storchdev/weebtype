---
title: "Passage variety comes from server-picked directions, not a random seed in the prompt"
author: Storchdev
date: 2026-11-14
branch: main
cost: { minutes: 11, tokens: 92803 }
id: l-363ce004
scope: repo
status: active
src: agent
touches:
  - PLAN.md
  - src/App.svelte
  - AGENTS.md
  - src/app.css
  - src/lib/ui/HistoryPanel.svelte
  - src/lib/ui/Results.svelte
  - src/lib/ui/SettingsPanel.svelte
  - README.md
  - src/lib/history.ts
  - src/lib/ui/TypingArea.svelte
---

## Decided
The LLM prompt gets a concrete subject, form, narrator and tone drawn from shuffle bags on the server, plus a list of the last few passages' subjects and opening sentences to avoid. Stock openings (今日は, 私は…です, weather talk) are discouraged.

## Tried and ruled out
Putting "variety seed <random number>" in the prompt and letting the model pick a topic. The model ignores the number, so tests converged on near-identical passages (same topics and openings), especially for the two parallel prefetches.

## Watch out
Prefetches run in parallel, so each generation must draw its own direction before the call; recording happens after success, so parallel calls can't see each other's openings — the distinct subjects are what keep them apart.

In the code: server/variety.ts (Variety, Bag, SUBJECTS/FORMS/NARRATORS/TONES), used in server/passages.ts generateOne; buildPrompt(level, length, steer) in server/llm.ts; tests/variety.test.ts.
