<script lang="ts">
// Opt-in battle mode: a little singer in the bottom-left corner sings each typed kana,
// which flies across the screen spinning and hits a marshmallow boss in the
// bottom-right corner. The boss's HP is the passage: full at the start, 0 when the
// last kana lands. Purely decorative — sits behind the page and never takes input.
//
// Per keystroke this only creates a few elements and runs Web Animations on
// transform/opacity; the screen positions it needs are measured on mount/resize/run.

import { onMount } from "svelte";
import { accentMelody } from "../core/accent.ts";
import type { Token } from "../core/types.ts";
import { singer } from "../singer.ts";

interface Props {
  runId: number;
  /** 0–100 */
  volume: number;
  /** CSS font-family for the flying kana. */
  font: string;
  /** The passage being typed; its pitch accent drives the singer's melody. */
  tokens: Token[] | undefined;
}
let { runId, volume, font, tokens }: Props = $props();

/** Pitch per char of the session target (concatenated readings). */
const melody = $derived(tokens ? accentMelody(tokens) : []);

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let layer: HTMLDivElement | undefined = $state();
let singerSvg: SVGSVGElement | undefined = $state();
let singerPop: HTMLDivElement | undefined = $state();
let bossSvg: SVGSVGElement | undefined = $state();
let bossHit: HTMLDivElement | undefined = $state();
let bossEnter: HTMLDivElement | undefined = $state();

let total = $state(1);
let landed = $state(0);
let singing = $state(false);
let hurt = $state(false);
let defeated = $state(false);
const hp = $derived(total > 0 ? Math.max(0, 1 - landed / total) : 1);
const low = $derived(hp > 0 && hp <= 0.3);

let mouth = { x: 0, y: 0 };
let target = { x: 0, y: 0, r: 40 };
const shots = new Set<{ el: HTMLElement; anim: Animation }>();
let fired = 0;
let singTimer: ReturnType<typeof setTimeout> | undefined;
let hurtTimer: ReturnType<typeof setTimeout> | undefined;

$effect(() => singer.setVolume(volume / 100));

function measure(): void {
  if (singerSvg) {
    const r = singerSvg.getBoundingClientRect();
    // mouth sits at (60, 84) in the 120×160 viewBox
    mouth = { x: r.left + (r.width * 60) / 120, y: r.top + (r.height * 84) / 160 };
  }
  if (bossSvg) {
    const r = bossSvg.getBoundingClientRect();
    target = { x: r.left + r.width * 0.42, y: r.top + r.height * 0.6, r: r.width * 0.22 };
  }
}

onMount(() => {
  measure();
  const onResize = () => measure();
  window.addEventListener("resize", onResize);
  return () => {
    window.removeEventListener("resize", onResize);
    clearShots();
    singer.sleep();
  };
});

function clearShots(): void {
  for (const s of shots) {
    s.anim.cancel();
    s.el.remove();
  }
  shots.clear();
}

// New run (retry / next passage): full HP, the boss bounces back in.
let lastRun = -1;
$effect(() => {
  if (runId === lastRun) return;
  const wasDown = defeated || landed > 0;
  lastRun = runId;
  clearShots();
  landed = 0;
  total = 1;
  defeated = false;
  hurt = false;
  fired = 0;
  singer.reset();
  if (wasDown && bossEnter && !reduceMotion.matches) {
    bossEnter.animate(
      [
        { transform: "translate3d(0, -40px, 0) scale(0.6)", opacity: 0 },
        { transform: "translate3d(0, 4px, 0) scale(1.06, 0.92)", opacity: 1, offset: 0.6 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }
  requestAnimationFrame(measure);
});

/** Called by the typing view for each batch of newly completed kana. */
export function fire(kana: string, done: number, of: number): void {
  total = of;
  singer.sing(kana, melody.length >= done ? melody.slice(done - kana.length, done) : undefined);
  singing = true;
  clearTimeout(singTimer);
  singTimer = setTimeout(() => (singing = false), 150);

  if (reduceMotion.matches || !layer) {
    land(done);
    return;
  }
  singerPop?.animate(
    [
      { transform: "none" },
      { transform: "translate3d(0, -4px, 0) scale(1.05, 0.97)" },
      { transform: "none" },
    ],
    { duration: 170, easing: "ease-out" },
  );
  if (++fired % 7 === 0) note();
  launch(kana, done);
}

const SHOT_COLORS = ["var(--hair)", "var(--accent)", "var(--plum-deep)", "var(--robe)"] as const;

function launch(kana: string, done: number): void {
  if (!layer) return;
  // keep the DOM small when typing very fast: land the oldest shot immediately
  if (shots.size > 28) {
    const oldest = shots.values().next().value;
    if (oldest) oldest.anim.finish();
  }
  const el = document.createElement("span");
  el.className = "shot";
  el.textContent = kana;
  el.style.color = SHOT_COLORS[fired % SHOT_COLORS.length] as string;
  el.style.fontFamily = font;
  layer.appendChild(el);

  const x0 = mouth.x;
  const y0 = mouth.y;
  const x1 = target.x + (Math.random() - 0.5) * target.r;
  const y1 = target.y + (Math.random() - 0.5) * target.r;
  const dx = x1 - x0;
  const arc = Math.min(260, Math.abs(dx) * 0.22) + Math.random() * 70;
  const spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 360);
  const frames: Keyframe[] = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = x0 + dx * t;
    const y = y0 + (y1 - y0) * t - arc * 4 * t * (1 - t);
    const s =
      t < 0.12 ? 0.3 + (t / 0.12) * 1.0 : t > 0.9 ? 1.3 - ((t - 0.9) / 0.1) * 0.6 : 1.3 - (t - 0.12) * 0.35;
    frames.push({
      transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${spin * t}deg) scale(${s})`,
      opacity: t < 0.06 ? t / 0.06 : 1,
      offset: t,
    });
  }
  const duration = 560 + Math.min(260, Math.abs(dx) * 0.18);
  const anim = el.animate(frames, { duration, easing: "linear", fill: "forwards" });
  const shot = { el, anim };
  shots.add(shot);
  anim.onfinish = () => {
    shots.delete(shot);
    el.remove();
    land(done, x1, y1);
  };
}

function land(done: number, x?: number, y?: number): void {
  if (defeated) return;
  landed = Math.max(landed, done);
  if (x !== undefined && y !== undefined) sparks(x, y);
  if (!reduceMotion.matches) {
    bossHit?.animate(
      [
        { transform: "none" },
        { transform: "translate3d(7px, 0, 0) scale(1.1, 0.88)" },
        { transform: "translate3d(-2px, 0, 0) scale(0.96, 1.05)" },
        { transform: "none" },
      ],
      { duration: 280, easing: "ease-out" },
    );
  }
  hurt = true;
  clearTimeout(hurtTimer);
  hurtTimer = setTimeout(() => (hurt = false), 170);
  if (landed >= total) {
    defeated = true;
    hurt = false;
  }
}

function sparks(x: number, y: number): void {
  if (!layer) return;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("span");
    el.className = "spark";
    el.style.background = SHOT_COLORS[(fired + i) % SHOT_COLORS.length] as string;
    layer.appendChild(el);
    const a = Math.PI * (0.6 + (1.8 * i) / n) + Math.random() * 0.4; // mostly back toward the left
    const d = 22 + Math.random() * 26;
    el.animate(
      [
        { transform: `translate3d(${x}px, ${y}px, 0) scale(1)`, opacity: 1 },
        {
          transform: `translate3d(${x + Math.cos(a) * d}px, ${y + Math.sin(a) * d}px, 0) scale(0.2)`,
          opacity: 0,
        },
      ],
      { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    ).onfinish = () => el.remove();
  }
}

/** A little ♪ drifting up from the singer now and then. */
function note(): void {
  if (!layer) return;
  const el = document.createElement("span");
  el.className = "note";
  el.textContent = Math.random() < 0.5 ? "♪" : "♫";
  layer.appendChild(el);
  const x = mouth.x - 30 - Math.random() * 20;
  el.animate(
    [
      { transform: `translate3d(${x}px, ${mouth.y - 20}px, 0) rotate(-10deg)`, opacity: 0 },
      { transform: `translate3d(${x - 6}px, ${mouth.y - 50}px, 0) rotate(8deg)`, opacity: 0.9, offset: 0.3 },
      { transform: `translate3d(${x - 14}px, ${mouth.y - 110}px, 0) rotate(-6deg)`, opacity: 0 },
    ],
    { duration: 1400, easing: "ease-out" },
  ).onfinish = () => el.remove();
}

const remaining = $derived(Math.max(0, total - landed));
</script>

<div class="battle" bind:this={layer} aria-hidden="true">
  <div class="singer">
    <div class="bob">
      <div class="pop" bind:this={singerPop}>
        <svg bind:this={singerSvg} class:singing viewBox="0 0 120 160" width="100%">
          <ellipse class="shadow" cx="60" cy="155" rx="34" ry="4.5" />
          <!-- hanging tails from the buns, swaying -->
          <g class="tail left">
            <path class="hair" d="M22,40 C10,62 12,96 20,118 C24,104 26,80 30,52 Z" />
          </g>
          <g class="tail right">
            <path class="hair" d="M98,40 C110,62 108,96 100,118 C96,104 94,80 90,52 Z" />
          </g>
          <!-- back hair -->
          <path class="hair shade" d="M28,62 C24,92 36,104 60,104 C84,104 96,92 92,62 Z" />
          <!-- body: kimono-ish top with obi -->
          <path class="robe" d="M42,98 L78,98 L92,152 L28,152 Z" />
          <path class="collar" d="M48,98 L60,116 L72,98 L66,98 L60,108 L54,98 Z" />
          <rect class="obi" x="34" y="122" width="52" height="9" rx="2" />
          <!-- arms -->
          <path class="robe" d="M42,102 C32,110 28,124 32,132 L40,130 C38,122 42,114 46,108 Z" />
          <path class="robe" d="M78,102 C88,110 92,124 88,132 L80,130 C82,122 78,114 74,108 Z" />
          <circle class="skin" cx="35" cy="133" r="4.5" />
          <circle class="skin" cx="85" cy="133" r="4.5" />
          <!-- buns -->
          <circle class="hair" cx="26" cy="38" r="14" />
          <circle class="hair" cx="94" cy="38" r="14" />
          <!-- head -->
          <circle class="skin" cx="60" cy="64" r="34" />
          <!-- headset band + earcups -->
          <path class="band" d="M24,62 C22,24 98,24 96,62" />
          <!-- bangs -->
          <path
            class="hair"
            d="M26,62 C24,34 42,26 60,26 C78,26 96,34 94,62 L88,50 L82,58 L76,46 L68,56 L60,44 L52,56 L44,46 L38,58 L32,50 Z"
          />
          <circle class="cup" cx="26" cy="66" r="7" />
          <circle class="cup" cx="94" cy="66" r="7" />
          <path class="boom" d="M28,72 C30,84 38,88 46,88" />
          <circle class="mic" cx="47" cy="88" r="2.6" />
          <!-- plum blossom hairpin -->
          <g class="pin" transform="translate(88 30) scale(0.55)">
            {#each [0, 72, 144, 216, 288] as a}
              <path class="petal" transform="rotate({a})" d="M0,-2 C6,-12 12,-6 8,-1 C6,2 2,2 0,-2 Z" />
            {/each}
            <circle class="pin-center" r="3" />
          </g>
          <!-- face -->
          <g class="eyes open">
            <ellipse class="eye" cx="47" cy="68" rx="4.8" ry="6.5" />
            <ellipse class="eye" cx="73" cy="68" rx="4.8" ry="6.5" />
            <circle class="glint" cx="48.6" cy="65.6" r="1.8" />
            <circle class="glint" cx="74.6" cy="65.6" r="1.8" />
          </g>
          <g class="eyes happy">
            <path class="line" d="M42,70 Q47,62 52,70" />
            <path class="line" d="M68,70 Q73,62 78,70" />
          </g>
          <ellipse class="cheek" cx="39" cy="78" rx="5.5" ry="3" />
          <ellipse class="cheek" cx="81" cy="78" rx="5.5" ry="3" />
          <path class="line mouth-closed" d="M56,82 Q60,86 64,82" />
          <ellipse class="mouth-open" cx="60" cy="84" rx="4.2" ry="4.8" />
        </svg>
      </div>
    </div>
  </div>

  <div class="boss" class:ko={defeated}>
    <div class="hpbox">
      <div class="name">マシュマロ大王 <span>{remaining}/{total > 1 ? total : "—"}</span></div>
      <div class="hp">
        <div class="ghost" style="transform: scaleX({hp})"></div>
        <div class="fill" style="transform: scaleX({hp})"></div>
      </div>
    </div>
    <div class="enter" bind:this={bossEnter}>
      <div class="hit" bind:this={bossHit}>
        <div class="idle">
          <svg bind:this={bossSvg} class:hurt class:low class:ko={defeated} viewBox="0 0 160 160" width="100%">
            <defs>
              <clipPath id="mallow-body"><rect x="22" y="40" width="116" height="106" rx="42" /></clipPath>
            </defs>
            <ellipse class="shadow" cx="80" cy="152" rx="58" ry="6" />
            <!-- stubby arms -->
            <ellipse class="mallow" cx="21" cy="104" rx="9" ry="12" transform="rotate(-20 21 104)" />
            <ellipse class="mallow" cx="139" cy="104" rx="9" ry="12" transform="rotate(20 139 104)" />
            <!-- body -->
            <rect class="mallow" x="22" y="40" width="116" height="106" rx="42" />
            <g clip-path="url(#mallow-body)">
              <ellipse class="mallow-shade" cx="80" cy="146" rx="70" ry="22" />
              <ellipse class="mallow-top" cx="80" cy="46" rx="56" ry="16" />
            </g>
            <rect class="mallow-edge" x="22" y="40" width="116" height="106" rx="42" />
            <ellipse class="gloss" cx="44" cy="74" rx="6" ry="13" transform="rotate(18 44 74)" />
            <!-- faces -->
            <g class="face normal">
              <circle class="eye" cx="62" cy="92" r="5" />
              <circle class="eye" cx="98" cy="92" r="5" />
              <circle class="glint" cx="63.6" cy="90.4" r="1.6" />
              <circle class="glint" cx="99.6" cy="90.4" r="1.6" />
              <path class="line" d="M72,103 q4,5 8,0 q4,5 8,0" />
            </g>
            <g class="face worried">
              <path class="line" d="M54,82 L66,86" />
              <path class="line" d="M106,82 L94,86" />
              <circle class="eye" cx="62" cy="94" r="4.5" />
              <circle class="eye" cx="98" cy="94" r="4.5" />
              <path class="line" d="M70,108 q5,-5 10,0 q5,5 10,0" />
              <path class="sweat" d="M122,62 C118,70 118,76 122,78 C126,76 126,70 122,62 Z" />
            </g>
            <g class="face ouch">
              <path class="line" d="M56,86 L66,92 L56,98" />
              <path class="line" d="M104,86 L94,92 L104,98" />
              <ellipse class="mouth" cx="80" cy="106" rx="5" ry="4" />
            </g>
            <g class="face out">
              <path class="line" d="M56,86 L68,98 M68,86 L56,98" />
              <path class="line" d="M92,86 L104,98 M104,86 L92,98" />
              <path class="line" d="M70,110 q10,-8 20,0" />
            </g>
            <ellipse class="cheek" cx="52" cy="104" rx="7" ry="3.5" />
            <ellipse class="cheek" cx="108" cy="104" rx="7" ry="3.5" />
            <!-- crown -->
            <g class="crown">
              <path d="M58,40 L54,18 L67,29 L80,12 L93,29 L106,18 L102,40 Z" />
              <circle class="jewel" cx="80" cy="31" r="3.2" />
              <circle class="jewel" cx="64" cy="34" r="2" />
              <circle class="jewel" cx="96" cy="34" r="2" />
            </g>
          </svg>
        </div>
      </div>
    </div>
    <div class="stamp">撃破</div>
  </div>
</div>

<style>
  .battle {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }
  .battle :global(.shot) {
    position: absolute;
    left: 0;
    top: 0;
    font-size: 30px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    will-change: transform, opacity;
    text-shadow: 0 0 10px color-mix(in srgb, currentColor 45%, transparent);
  }
  .battle :global(.spark) {
    position: absolute;
    left: -4px;
    top: -4px;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    will-change: transform, opacity;
  }
  .battle :global(.note) {
    position: absolute;
    left: 0;
    top: 0;
    font-size: 20px;
    color: var(--hair);
    will-change: transform, opacity;
  }

  /* ---- singer ---- */
  .singer {
    position: absolute;
    left: 2.5vw;
    bottom: 48px;
    width: clamp(84px, 9vw, 128px);
  }
  .bob {
    animation: bob 2.4s ease-in-out infinite;
  }
  @keyframes bob {
    50% {
      transform: translate3d(0, -3px, 0);
    }
  }
  .pop {
    transform-origin: 50% 100%;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .shadow {
    fill: var(--faint);
  }
  .hair {
    fill: var(--hair);
  }
  .hair.shade {
    fill: var(--hair-shade);
  }
  .tail {
    animation: sway 2.4s ease-in-out infinite;
  }
  .tail.left {
    transform-origin: 26px 40px;
  }
  .tail.right {
    transform-origin: 94px 40px;
    animation-delay: -1.2s;
  }
  @keyframes sway {
    50% {
      transform: rotate(4deg);
    }
  }
  .robe {
    fill: var(--robe);
  }
  .collar {
    fill: var(--mallow);
  }
  .obi {
    fill: var(--accent);
  }
  .skin {
    fill: var(--skin);
  }
  .band,
  .boom {
    fill: none;
    stroke: var(--robe);
    stroke-width: 2.6;
    stroke-linecap: round;
  }
  .cup,
  .mic {
    fill: var(--robe);
  }
  .petal {
    fill: var(--plum);
  }
  .pin-center {
    fill: var(--plum-center);
  }
  .eye {
    fill: var(--eye);
  }
  .glint {
    fill: var(--mallow);
  }
  .line {
    fill: none;
    stroke: var(--eye);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .cheek {
    fill: var(--cheek);
    opacity: 0.75;
  }
  .mouth-open,
  .mouth {
    fill: var(--mouth);
  }
  .eyes,
  .mouth-open,
  .mouth-closed,
  .face {
    transition: opacity 0.06s linear;
  }
  .eyes.happy,
  .mouth-open {
    opacity: 0;
  }
  .singing .eyes.happy,
  .singing .mouth-open {
    opacity: 1;
  }
  .singing .eyes.open,
  .singing .mouth-closed {
    opacity: 0;
  }

  /* ---- boss ---- */
  .boss {
    position: absolute;
    right: 2.5vw;
    bottom: 48px;
    width: clamp(110px, 11vw, 168px);
  }
  .hpbox {
    margin-bottom: 6px;
    transition: opacity 0.4s var(--ease-out);
  }
  .name {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .name span {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .hp {
    position: relative;
    height: 6px;
    margin-top: 3px;
    border-radius: 3px;
    background: var(--faint);
    overflow: hidden;
  }
  .hp div {
    position: absolute;
    inset: 0;
    transform-origin: left;
  }
  .ghost {
    background: var(--plum-center);
    transition: transform 0.5s var(--ease-out) 0.3s;
  }
  .fill {
    background: var(--accent);
    transition: transform 0.12s var(--ease-out);
  }
  .idle {
    transform-origin: 50% 100%;
    animation: wobble 3s ease-in-out infinite;
  }
  @keyframes wobble {
    25% {
      transform: scale(1.02, 0.98);
    }
    50% {
      transform: scale(0.99, 1.015);
    }
    75% {
      transform: scale(1.015, 0.985);
    }
  }
  .hit {
    transform-origin: 50% 100%;
  }
  .mallow {
    fill: var(--mallow);
    stroke: var(--mallow-line);
    stroke-width: 2;
  }
  .mallow-shade {
    fill: var(--mallow-shade);
  }
  .mallow-top {
    fill: var(--mallow-top);
  }
  .mallow-edge {
    fill: none;
    stroke: var(--mallow-line);
    stroke-width: 2;
  }
  .gloss {
    fill: var(--mallow-top);
    opacity: 0.9;
  }
  .face {
    opacity: 0;
  }
  svg:not(.hurt):not(.low):not(.ko) .face.normal,
  .low:not(.hurt):not(.ko) .face.worried,
  .hurt:not(.ko) .face.ouch,
  .ko .face.out {
    opacity: 1;
  }
  .sweat {
    fill: var(--sweat);
  }
  .crown path {
    fill: var(--plum-center);
    stroke: var(--mallow-line);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .jewel {
    fill: var(--accent);
  }
  .crown {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    transform: rotate(-8deg);
    transition:
      transform 0.7s cubic-bezier(0.34, 1.4, 0.64, 1),
      opacity 0.5s var(--ease-out) 0.3s;
  }
  .ko .crown {
    transform: translate3d(46px, 92px, 0) rotate(130deg);
  }
  .ko .idle {
    animation: none;
  }
  .boss.ko .hit {
    transform: scale(1.12, 0.78);
    transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .boss.ko .hpbox {
    opacity: 0.45;
  }
  .stamp {
    position: absolute;
    left: 50%;
    top: 46%;
    padding: 3px 9px;
    border: 2px solid var(--accent);
    border-radius: 4px;
    color: var(--accent);
    font-family: var(--title-font);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.15em;
    background: color-mix(in srgb, var(--paper) 70%, transparent);
    opacity: 0;
    transform: translate(-50%, -50%) rotate(-12deg) scale(1.8);
    transition:
      opacity 0.2s var(--ease-out),
      transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .boss.ko .stamp {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(-12deg) scale(1);
    transition-delay: 0.25s;
  }

  @media (prefers-reduced-motion: reduce) {
    .bob,
    .tail,
    .idle {
      animation: none;
    }
  }
</style>
