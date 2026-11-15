---
title: Translations of trimmed passages tolerate models splitting quotes into separate sentences
author: Storchdev
date: 2026-11-15
branch: main
cost: { minutes: 2, tokens: 42401 }
id: l-fcc8e972
scope: repo
status: active
src: agent
touches:
  - PLAN.md
  - server/normalize.ts
  - tests/normalize.test.ts
  - server/llm.ts
---

## Decided
The prompt asks for one English translation per top-level sentence, with a quoted 「…。」 belonging to the sentence around it. Models (claude sonnet seen) still translate each sentence inside a multi-sentence quote separately. For a trimmed passage the counts then didn't match and the translation was dropped, so the results screen showed none. It looked like a cache bug because the affected passage happened to come from the passage cache. Now, when the top-level count misses, the count of every 。！？ run (any depth) is tried. Trims always end on a top-level end, which is also one of those, so slicing stays aligned.

## Tried and ruled out
Relying on the prompt rule alone: it's already there and gets ignored.

## Watch out
Passages already in the cache keep the empty translation they were saved with; the fix only applies to newly generated ones. If neither count matches, a trimmed passage still gets no translation, on purpose.

In the code: translationFor + innerSentenceCount in server/normalize.ts; TRANSLATIONS_RULE in server/llm.ts; test "a quote translated sentence by sentence still trims" in tests/normalize.test.ts.
