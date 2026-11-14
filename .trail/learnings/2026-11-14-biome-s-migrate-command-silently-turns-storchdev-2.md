---
title: "Biome's migrate command silently turns off recommended lint rules, and Svelte files need their own lint overrides"
author: Storchdev
date: 2026-11-14
branch: main
cost: { minutes: 1, tokens: 2340 }
id: l-ffbcb6ac
scope: repo
status: active

src: agent
touches:
  - biome.json
---

## Decided
biome.json uses `"preset": "recommended"`. An override for `**/*.svelte` turns off noUnusedImports, noUnusedVariables and useConst. Another turns off noImportantStyles for CSS, because the reduced-motion block needs `!important`.

## Tried and ruled out
The default rules on .svelte files. Biome parses only the `<script>` block, so it reports every component import and template-only variable as unused. They are marked as unsafe fixes, so `--write` leaves them, but `biome check` fails. A `--write --unsafe` run would delete code the template needs.

## Watch out
`biome migrate --write` (Biome 2.x) rewrote `"recommended": true` to `"preset": "none"`, which disables every lint rule with no error. After migrating, check that biome.json still says `"preset": "recommended"`.

In the code: the biome.json overrides; `bun run lint` runs `biome check .`.
