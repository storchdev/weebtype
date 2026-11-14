// Keyboard click sounds (opt-in). CC0 keystrokes from unicaegames' "Keyboard soundpack 1"
// (OpenGameArt), trimmed to public/sounds/keys/key-NN.wav.
//
// Played through plain <audio> elements, not Web Audio: on some setups Web Audio output is
// silent while media elements (what video sites use) play fine.

const COUNT = 12;
/** Elements per clip so fast typing can overlap clicks. */
const VOICES = 3;

let pool: HTMLAudioElement[][] | null = null;
let last = -1;
const rr: number[] = Array.from({ length: COUNT }, () => 0);

function load(): HTMLAudioElement[][] {
  pool ??= Array.from({ length: COUNT }, (_, i) => {
    const src = `/sounds/keys/key-${String(i + 1).padStart(2, "0")}.wav`;
    return Array.from({ length: VOICES }, () => {
      const a = new Audio(src);
      a.preload = "auto";
      a.preservesPitch = false; // let playbackRate vary the pitch a little
      return a;
    });
  });
  return pool;
}

/** Preload the clips (call when the setting is on, before the first key). */
export function preloadKeySounds(): void {
  load();
}

/** Play a random keystroke; misses sound a little duller and quieter. `volume` is 0–1. */
export function playKey(volume: number, miss = false): void {
  if (volume <= 0) return;
  const clips = load();
  let i = Math.floor(Math.random() * COUNT);
  if (i === last) i = (i + 1) % COUNT;
  last = i;
  const voices = clips[i] as HTMLAudioElement[];
  const n = rr[i] ?? 0;
  rr[i] = (n + 1) % VOICES;
  const a = voices[n] as HTMLAudioElement;
  a.volume = Math.min(1, volume * (miss ? 0.6 : 1) * (0.85 + Math.random() * 0.15));
  a.playbackRate = (miss ? 0.85 : 1) * (0.96 + Math.random() * 0.08);
  a.currentTime = 0;
  void a.play().catch(() => {});
}
