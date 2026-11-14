// Page geometry shared by App (CSS variables) and TypingArea (how many lines fit), so
// the two can't disagree. Pure numbers in px.

/** Phones and narrow windows: no plum branch, stacked dictionary, smaller stage. */
export const NARROW = 640;

export function isNarrow(winW: number): boolean {
  return winW <= NARROW;
}

/** Width of the plum branch in the top-right corner (0 = hidden). Smaller in battle mode. */
export function branchWidth(winW: number, winH: number, battle: boolean): number {
  if (isNarrow(winW)) return 0;
  return battle
    ? Math.min(Math.max(160, winW * 0.2), 320, winH * 0.3)
    : Math.min(Math.max(200, winW * 0.3), 440, winH * 0.44);
}

export const branchHeight = (branchW: number): number => branchW * 0.545;

/** Height of the battle stage band above the footer (singer, boss, flying kana). */
export function stageHeight(winW: number, winH: number): number {
  return isNarrow(winW) ? Math.min(130, Math.max(96, winH * 0.15)) : Math.min(220, Math.max(120, winH * 0.2));
}

/** Top padding of the main area: clear of the branch's lowest blossom. */
export function mainTop(winH: number, branchW: number): number {
  return Math.max(winH * 0.04, branchHeight(branchW) - 30);
}
