<script lang="ts">
// Hand-authored 梅 (ume / plum blossom) branch. All colours come from theme tokens.

interface Flower {
  x: number;
  y: number;
  s: number;
  r: number;
}

// Branch limbs drawn with decreasing stroke width to give a tapered, angular ume look.
const limbs: Array<{ d: string; w: number }> = [
  { d: "M430,26 C392,28 356,40 318,58", w: 9 },
  { d: "M318,58 C292,70 268,76 240,96", w: 7 },
  { d: "M240,96 C220,110 200,116 176,140", w: 5.2 },
  { d: "M176,140 C160,158 148,162 128,186", w: 3.6 },
  { d: "M128,186 L114,212", w: 2.2 },
  { d: "M318,58 C312,42 302,30 288,18", w: 3.2 },
  { d: "M288,18 L272,8", w: 1.7 },
  { d: "M240,96 C247,118 245,140 256,164", w: 3 },
  { d: "M256,164 L263,190", w: 1.8 },
  { d: "M176,140 C160,130 142,128 124,118", w: 2.4 },
  { d: "M124,118 L108,113", w: 1.4 },
  { d: "M128,186 C112,186 100,191 86,199", w: 1.7 },
  { d: "M372,36 C368,50 372,62 366,74", w: 2.2 },
];

const flowers: Flower[] = [
  { x: 300, y: 38, s: 1.15, r: 12 },
  { x: 344, y: 46, s: 0.9, r: 40 },
  { x: 266, y: 84, s: 1.05, r: -8 },
  { x: 220, y: 110, s: 0.92, r: 25 },
  { x: 252, y: 146, s: 1.08, r: 5 },
  { x: 192, y: 132, s: 0.78, r: 50 },
  { x: 150, y: 168, s: 0.88, r: -20 },
  { x: 136, y: 121, s: 0.72, r: 15 },
  { x: 366, y: 76, s: 0.8, r: 60 },
  { x: 104, y: 194, s: 0.66, r: 33 },
];

const buds: Array<{ x: number; y: number; s: number; r: number }> = [
  { x: 271, y: 8, s: 1, r: -60 },
  { x: 264, y: 191, s: 0.9, r: 160 },
  { x: 113, y: 214, s: 0.85, r: 200 },
  { x: 106, y: 112, s: 0.8, r: -100 },
  { x: 85, y: 200, s: 0.75, r: -140 },
  { x: 232, y: 98, s: 0.7, r: -40 },
];

const petalAngles = [0, 72, 144, 216, 288];
const stamenAngles = Array.from({ length: 14 }, (_, i) => i * (360 / 14));
</script>

<svg class="branch" viewBox="0 0 440 240" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="ume-petal" cx="0.5" cy="0.75" r="0.8">
      <stop offset="0" style="stop-color: var(--plum-deep)" />
      <stop offset="0.55" style="stop-color: var(--plum)" />
      <stop offset="1" style="stop-color: var(--plum)" stop-opacity="0.85" />
    </radialGradient>
    <symbol id="ume" viewBox="-16 -16 32 32" overflow="visible">
      {#each petalAngles as a}
        <circle cx="0" cy="-6.9" r="6.4" transform="rotate({a})" fill="url(#ume-petal)" class="petal" />
      {/each}
      <circle r="2.8" class="core" />
      {#each stamenAngles as a, i}
        <g transform="rotate({a})">
          <line x1="0" y1="-1.5" x2="0" y2={i % 2 ? -5.4 : -6.6} class="stamen" />
          <circle cx="0" cy={i % 2 ? -5.6 : -6.8} r="0.75" class="anther" />
        </g>
      {/each}
    </symbol>
    <symbol id="ume-bud" viewBox="-6 -8 12 14" overflow="visible">
      <path d="M-2.4,3 C-3.2,0.5 -1.6,-2 0,-2.2 C1.6,-2 3.2,0.5 2.4,3 Z" class="sepal" />
      <ellipse cx="0" cy="-2.6" rx="3.2" ry="3.8" fill="url(#ume-petal)" />
    </symbol>
  </defs>

  <g class="limbs">
    {#each limbs as l}
      <path d={l.d} stroke-width={l.w} />
    {/each}
  </g>
  <!-- bark highlights -->
  <g class="bark">
    <path d="M410,26 C380,28 352,38 326,52" />
    <path d="M300,66 C282,74 266,80 248,92" />
  </g>

  {#each buds as b}
    <use href="#ume-bud" x="-6" y="-8" width="12" height="14" transform="translate({b.x} {b.y}) rotate({b.r}) scale({b.s})" />
  {/each}
  {#each flowers as f}
    <use href="#ume" x="-16" y="-16" width="32" height="32" transform="translate({f.x} {f.y}) rotate({f.r}) scale({f.s})" />
  {/each}
</svg>

<style>
  .branch {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .limbs path {
    fill: none;
    stroke: var(--branch);
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .bark path {
    fill: none;
    stroke: var(--branch-light);
    stroke-width: 1;
    stroke-linecap: round;
    opacity: 0.55;
  }
  :global(.branch .petal) {
    stroke: var(--plum-deep);
    stroke-width: 0.35;
    stroke-opacity: 0.6;
  }
  :global(.branch .core) {
    fill: var(--plum-deep);
    opacity: 0.7;
  }
  :global(.branch .stamen) {
    stroke: var(--stamen);
    stroke-width: 0.45;
    stroke-linecap: round;
  }
  :global(.branch .anther) {
    fill: var(--plum-center);
  }
  :global(.branch .sepal) {
    fill: var(--branch);
  }
</style>
