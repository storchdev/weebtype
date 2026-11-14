---
title: "Battle mode uses an original singer and a synthesized voice, not Hatsune Miku art or Vocaloid samples"
author: Storchdev
date: 2026-11-14
branch: main
cost: { minutes: 8, tokens: 144955 }
id: l-7b4cdc3c
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - PLAN.md
  - scripts/screenshot.ts
  - src/App.svelte
  - src/app.css
  - src/lib/core/voice.ts
  - src/lib/settings.svelte.ts
  - src/lib/singer.ts
  - src/lib/ui/Battle.svelte
  - src/lib/ui/SettingsPanel.svelte
---

## Decided
- The user asked for a Hatsune Miku animation with the Vocaloid sound. Built an original chibi singer instead (plum-pink buns, kimono, headset, plum hairpin), and a Web Audio formant synth sings each kana: vowel formants, consonant noise burst, pentatonic random-walk melody with portamento.
- The boss's HP is the passage's kana count (punctuation included), so it reaches exactly 0 on the last key.

## Tried and ruled out
- Miku character art and voicebank samples: copyrighted character, proprietary voicebank, can't be shipped in the repo.

## Watch out
- The audio can't be heard in headless checks. Render offline instead (Singer accepts a context factory, and sing() takes an explicit time) and check peak/RMS, or write a WAV for a human to listen to.
- Projectiles are created imperatively with WAAPI; screen positions are measured only on mount/resize/new run, never per keystroke.

In the code:
- src/lib/singer.ts (synth), src/lib/core/voice.ts (pure kana→syllable + Melody, tests/voice.test.ts), src/lib/ui/Battle.svelte, TypingArea `onkana` prop, settings `battle` / `battleVolume`.
