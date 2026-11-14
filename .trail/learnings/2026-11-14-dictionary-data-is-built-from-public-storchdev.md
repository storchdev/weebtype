---
title: "Dictionary data is built from public downloads at setup, not copied from a local folder"
author: Storchdev
date: 2026-11-14
branch: main
cost: { minutes: 1, tokens: 1620 }
id: l-a7cb8586
scope: repo
status: active
src: agent
touches:
  - scripts/setup-data.ts
  - scripts/build-data.ts
  - tests/build-data.test.ts
---

## Decided
New users can't get the old 10ff-yomitan folder (it lived in a private repo and only on one machine, at a path that moved), so `scripts/setup-data.ts` downloads public sources and builds data/ itself. Jitendex's Yomitan zip gives dictionary + example sentences; Kanjium's raw accents.txt gives pitch. `bun start` and `bun dev` run it automatically when data/ is incomplete, and keep going without hints if offline.

## Tried and ruled out
Keeping a configurable "import from directory" step: it only helps people who already have the files. Checked the new builder against the old files: pitch output was identical, and dictionary/examples differed only where Jitendex has since been updated.

## Watch out
Kanjium leaves the reading column empty for kana-only words (reading = the term) and repeats some rows; both are handled in `buildPitch`. Ruby furigana lives in <rt>, which the generic text flattener skips, so `buildExamples` reads <rt> content directly. Needs `unzip` on PATH.

In the code: `scripts/setup-data.ts` (flags --force/--soft/--jitendex/--pitch), `scripts/build-data.ts` (`buildDictionary`, `buildExamples`, `buildPitch`), `tests/build-data.test.ts`.
