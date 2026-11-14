---
title: Kanji stems in the offline sentences only absorb following kana when the result is a verb or adjective
author: Storchdev
date: 2026-11-14
branch: main
cost: { minutes: 6, tokens: 85658 }
id: l-28bc2b94
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - PLAN.md
  - server/dictionary.ts
  - server/passages.ts
  - server/tatoeba.ts
  - src/App.svelte
  - src/lib/settings.svelte.ts
  - src/lib/ui/DictPanel.svelte
  - src/lib/ui/SettingsPanel.svelte
---

## Decided
In Tatoeba sentences a kanji is often its own token with the kana after it split off (歩 | いて行きますか). For the dictionary hint, the kanji token takes the longest following kana that makes an *inflected* word with that reading: a deinflection match (歩いて → 歩く), or an entry tagged as a verb or adjective. The consumed kana token then shows the same entry.

## Tried and ruled out
Accepting any dictionary entry for kanji + kana. Noun compounds that happen to exist grab the particle that follows: 本 + の matched 本の (ほんの, "mere") instead of 本 "book". The data-dependent test in tests/tatoeba.test.ts covers this case.

## Watch out
Na-adjectives and suru-verbs (静かな, 勉強して) don't extend; the bare kanji entry is shown instead, which is usually still right. Kana-only tokens prefer the entry spelled in kana, otherwise の resolves to 野 ("field").

In the code: PassageService.annotate (server/passages.ts), Dictionary.isInflectedWord and the lookup ordering (server/dictionary.ts).
