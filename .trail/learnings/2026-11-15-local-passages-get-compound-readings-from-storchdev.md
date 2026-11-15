---
title: "Local passages get compound readings from the dictionary, but only where the analyzer split the word"
author: Storchdev
date: 2026-11-15
branch: main
cost: { minutes: 12, tokens: 40287 }
id: l-a4becf48
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - PLAN.md
  - server/analyzer.ts
  - server/dictionary.ts
  - server/llm.ts
  - server/passages.ts
  - tests/analyzer.test.ts
  - src/lib/core/ticks.ts
  - src/lib/ui/Results.svelte
  - tests/ticks.test.ts
---

## Decided
- kuromoji (IPAdic) reads number + counter and noun + suffix piece by piece (一人 いちにん, 一本 いちほん, 三日 さんにち, 午前中 ごぜんなか). Those runs are joined and take Jitendex's most common reading for the joined text; ties go to kuromoji's own reading.
- Counts Jitendex doesn't list (三匹, 二十分, 六百五十円) get the regular sound changes instead of a word list.
- Only runs kuromoji itself split are joined. Its segmentation decides the meaning (十分 kept whole = "enough" じゅうぶん; split 十|分 = minutes); Jitendex only supplies the reading.

## Tried and ruled out
- Reading whole passages with Yomitan-style longest match + Jitendex: it lists every reading without choosing (一人 ひとり/いちにん, 上手 じょうず/うわて/かみて) and longest match mis-segments (今日本 → 今日|本). The reading check can't catch いちにん either, since it's a valid Jitendex reading.

## Watch out
- For 分, Jitendex's top reading is a different word (一分 いちぶ, 五分 ごぶ, 十分 じゅうぶん), so 分 read as minutes keeps only ふん/ぷん readings. Check new counters the same way before trusting the top reading.
- 一日 is いちにち except right after 〜月 (ついたち). Jitendex has no 部屋中 (へやじゅう), so it stays wrong.
- A joined count is one ruby group, so its kanji convert together.

In the code: server/analyzer.ts (compoundAt, pickReading, joinCountReadings), Dictionary.writtenReadings in server/dictionary.ts, passed as GenerateOptions.words from PassageService. Check: 8 local passages from Qwen3.5-35B-A3B, every changed reading correct (十日 とおか, 五日 いつか, 四人 よにん, 二十四時間 にじゅうよじかん, 七時 しちじ, 二十歳 はたち).
