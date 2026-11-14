---
title: "Passage prompts keep a fixed system prompt so Claude's default prompt and MCP tools aren't paid for every passage"
author: Storchdev
date: 2026-11-14
branch: main
cost: { minutes: 6, tokens: 106729 }
id: l-f9f3e5d3
scope: repo
status: active
src: agent
touches:
  - server/llm.ts
  - server/passages.ts
---

## Decided
The prompt is split into a fixed system part (every rule + the output format, byte-identical each request) and a short user part (level, length, variety steer, recent passages). claude gets the fixed part via --system-prompt, which replaces Claude Code's own system prompt, plus --strict-mcp-config so no MCP tool definitions are sent. Measured on haiku: input went from ~5.2k to ~2.1k tokens, and repeat calls read ~1.4-1.8k of that from the prompt cache. codex and llama-server get the fixed part first so their prefix caches hit.

## Tried and ruled out
--effort low: no measurable output saving on haiku (3.2k vs 3.9k output tokens, within run-to-run noise). --bare: would cut more, but it only accepts ANTHROPIC_API_KEY, not the user's logged-in subscription.

## Watch out
Output (~3.5k tokens even for a 30-kana passage, the ruby-group JSON) is now the main cost. Anything per-request put into the system prompt breaks the cache.

In the code: server/llm.ts SYSTEM_PROMPT, buildPrompt, generate; unused prefetched passages persist in data/cache/passages.json (server/passages.ts).
