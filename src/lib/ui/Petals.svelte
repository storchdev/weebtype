<script lang="ts">
// A few plum petals drifting down. Pure CSS animation on transform/opacity (GPU-composited).

interface Petal {
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  spin: number;
  sway: number;
}

// Deterministic pseudo-random so petals don't jump around between renders.
function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const r = rand(7);
const petals: Petal[] = Array.from({ length: 11 }, () => ({
  left: 45 + r() * 55,
  size: 7 + r() * 7,
  duration: 16 + r() * 14,
  delay: -r() * 30,
  drift: -(18 + r() * 30),
  spin: (r() > 0.5 ? 1 : -1) * (240 + r() * 360),
  sway: 1.8 + r() * 1.8,
}));
</script>

<div class="petals" aria-hidden="true">
  {#each petals as p}
    <div
      class="fall"
      style="left:{p.left}vw; --dur:{p.duration}s; --delay:{p.delay}s; --dx:{p.drift}vw; --spin:{p.spin}deg;"
    >
      <div class="sway" style="--sway:{p.sway}s;">
        <svg width={p.size} height={p.size} viewBox="-10 -10 20 20">
          <path d="M0,-8 C6,-8 8,-2 6,3 C4,7 1,8 0,8 C-1,8 -4,7 -6,3 C-8,-2 -6,-8 0,-8 Z" />
        </svg>
      </div>
    </div>
  {/each}
</div>

<style>
  .petals {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }
  .fall {
    position: absolute;
    top: 0;
    will-change: transform, opacity;
    animation: fall var(--dur) linear var(--delay) infinite;
  }
  .sway {
    animation: sway var(--sway) ease-in-out infinite alternate;
  }
  svg {
    display: block;
    animation: spin var(--dur) linear var(--delay) infinite;
  }
  path {
    fill: var(--plum);
    opacity: 0.75;
  }
  @keyframes fall {
    0% {
      transform: translate3d(0, -5vh, 0);
      opacity: 0;
    }
    8% {
      opacity: 1;
    }
    85% {
      opacity: 0.9;
    }
    100% {
      transform: translate3d(var(--dx), 105vh, 0);
      opacity: 0;
    }
  }
  @keyframes sway {
    from {
      transform: translate3d(-14px, 0, 0);
    }
    to {
      transform: translate3d(14px, 0, 0);
    }
  }
  @keyframes spin {
    from {
      transform: rotate(0deg) scaleX(1);
    }
    50% {
      transform: rotate(calc(var(--spin) / 2)) scaleX(0.45);
    }
    to {
      transform: rotate(var(--spin)) scaleX(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .petals {
      display: none;
    }
  }
</style>
