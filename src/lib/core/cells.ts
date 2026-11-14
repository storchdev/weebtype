// Visual cells for the typing view. Kana groups are split per character so they
// fill in letter by letter; kanji groups are one cell that "converts" when its
// whole reading is typed.

import { allKana, isPunct } from "./kana.ts";
import type { TypingSession } from "./session.ts";

export interface Cell {
  text: string;
  /** Kana range in the session target. */
  start: number;
  end: number;
  token: number;
  kanji: boolean;
  punct: boolean;
  firstOfToken: boolean;
  lastOfToken: boolean;
}

export function buildCells(session: TypingSession): Cell[] {
  const cells: Cell[] = [];
  const toks = session.passage.tokens;
  for (const gs of session.groups) {
    const g = toks[gs.token]?.groups[gs.index];
    if (!g) continue;
    const chars = [...g.t];
    const first = cells.length;
    if (allKana(g.t) && chars.length === gs.end - gs.start) {
      chars.forEach((ch, j) => {
        cells.push({
          text: ch,
          start: gs.start + j,
          end: gs.start + j + 1,
          token: gs.token,
          kanji: false,
          punct: false,
          firstOfToken: false,
          lastOfToken: false,
        });
      });
    } else if (chars.every(isPunct) && chars.length === gs.end - gs.start) {
      chars.forEach((ch, j) => {
        cells.push({
          text: ch,
          start: gs.start + j,
          end: gs.start + j + 1,
          token: gs.token,
          kanji: false,
          punct: true,
          firstOfToken: false,
          lastOfToken: false,
        });
      });
    } else {
      cells.push({
        text: g.t,
        start: gs.start,
        end: gs.end,
        token: gs.token,
        kanji: true,
        punct: false,
        firstOfToken: false,
        lastOfToken: false,
      });
    }
    if (gs.index === 0 && cells[first]) (cells[first] as Cell).firstOfToken = true;
  }
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i] as Cell;
    const n = cells[i + 1];
    c.lastOfToken = !n || n.token !== c.token;
  }
  return cells;
}

/** Index of the first cell not fully typed, scanning forward from `from`. */
export function currentCell(cells: Cell[], kanaDone: number, from = 0): number {
  let i = Math.max(0, from);
  while (i < cells.length && (cells[i] as Cell).end <= kanaDone) i++;
  return i;
}

/**
 * Group cells into unbreakable words for line wrapping: one per token, with
 * following punctuation attached so lines never start with 、。」 etc.
 * Opening brackets attach to the following word instead.
 */
export function buildWords(cells: Cell[]): number[][] {
  const words: number[][] = [];
  let pendingOpen: number[] = [];
  let lastToken = -1;
  cells.forEach((c, i) => {
    const opening = c.punct && (c.text === "「" || c.text === "『" || c.text === "（");
    if (opening) {
      pendingOpen.push(i);
      return;
    }
    const prev = words[words.length - 1];
    if (prev && (c.token === lastToken || (c.punct && pendingOpen.length === 0))) {
      prev.push(i);
    } else {
      words.push([...pendingOpen, i]);
      pendingOpen = [];
    }
    lastToken = c.token;
  });
  if (pendingOpen.length) words.push(pendingOpen);
  return words;
}
