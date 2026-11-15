---
title: Local models write the passage text; a morphological analyzer supplies the readings
author: Storchdev
date: 2026-11-15
branch: main
cost: { minutes: 15, tokens: 99066 }
id: l-57e54038
scope: repo
status: active
replaces: l-a4f01435
src: agent
touches:
  - server/analyzer.ts
  - tests/analyzer.test.ts
  - server/llm.ts
---

## Decided
The llama backend asks the model only for plain text plus translations and names. kuromoji (IPAdic) segments and reads it, and the model is asked again only for words kuromoji can't read. With Qwen3.5-35B-A3B (Q4, MoE experts in RAM, RTX 4070 12GB, thinking off) a passage takes ~5s, and 6 test passages had 0 dictionary reading problems in 476 tokens. claude and codex keep the one-pass per-kanji ruby format.

## Tried and ruled out
- One pass (write + split into ruby groups under the JSON grammar): ~45s, broken grammar and wrong readings in about half the passages. The same model's plain-text prose is fluent, so the schema was the problem.
- Model annotates the finished text in a second call: still wrong readings (老夫婦→おいおとこふ, 実った→みった) and it changes the text while copying it. Per-sentence retries with dictionary feedback took up to 358s per passage and still failed.
- Thinking on (budget 1500): 2-3x slower, no more accurate. Temperature 0.5: no clear gain.
- Qwen3.8-27B at IQ3_XS fully on the GPU: 3 bits is too low, broken output.

## Watch out
Readings are per morpheme (病棟/びょうとう), not per kanji. IPAdic still misses some context readings (間→ま for あいだ, 一日中→いちにちちゅう). 一人/二人 are special-cased. Any request's `temperature` overrides llama-server's --temp.

In the code: server/analyzer.ts (tokensFromMorphemes, analyze), server/llm.ts generateLlama + COMPOSE_PROMPT/READINGS_PROMPT; launcher outside the repo at ~/dotfiles/scripts/.local/bin/weebtype.
