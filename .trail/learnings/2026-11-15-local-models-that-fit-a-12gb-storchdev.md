---
title: Local models that fit a 12GB GPU write noticeably worse passages than claude or codex
author: Storchdev
date: 2026-11-15
branch: main
cost: { minutes: 28, tokens: 82551 }
id: l-a4f01435
scope: repo
status: active
src: agent
touches:
  - server/llm.ts
---

## Decided
The llama backend runs Qwen3.5-35B-A3B (Unsloth UD-Q4_K_XL, MoE: experts in system RAM, the rest on an RTX 4070 12GB), thinking off. About 51 tok/s, ~45s per passage. It is the best of what was tried, but roughly half of its passages have ungrammatical Japanese or wrong per-kanji readings (設→け, 亭主→ぬし, 湯気→ゆけ), and translations are sometimes returned in Japanese.

## Tried and ruled out
- Qwen3.8-27B at IQ3_XS (3 bpw, fully on the GPU): 32 tok/s, ~90s per passage, broken grammar and readings. The quant is too low.
- Thinking on with a 1500-token budget: 2-3x slower and no more accurate.
- Temperature 0.5 instead of the app's 0.8: no clear gain, and one request ran past 5 minutes.
The likely cause is that the model has to write the passage while splitting it into ruby groups under a JSON grammar. A two-step prompt (plain passage first, then segmentation) or checking readings against the dictionary is the next thing to try, not a different sampler setting.

## Watch out
Any request sends `temperature: 0.8`, which overrides llama-server's --temp.

In the code: server/llm.ts generateLlama; launcher outside the repo at ~/dotfiles/scripts/.local/bin/weebtype; model at ~/models/Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf.
