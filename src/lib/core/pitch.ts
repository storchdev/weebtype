// Pitch accent helpers, ported from yomidevs/yomitan (GPLv3) via 10ff-yomitan:
// ext/js/language/ja/japanese.js (getKanaMorae, isMoraPitchHigh).

const SMALL_KANA = new Set([..."ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ"]);

export function getKanaMorae(text: string): string[] {
  const morae: string[] = [];
  for (const c of text) {
    if (SMALL_KANA.has(c) && morae.length > 0) morae[morae.length - 1] += c;
    else morae.push(c);
  }
  return morae;
}

export function isMoraPitchHigh(moraIndex: number, downstep: number): boolean {
  switch (downstep) {
    case 0:
      return moraIndex > 0;
    case 1:
      return moraIndex < 1;
    default:
      return moraIndex > 0 && moraIndex < downstep;
  }
}

export interface Mora {
  text: string;
  high: boolean;
  drop: boolean;
}

export function pitchMorae(reading: string, downstep: number): Mora[] {
  const morae = getKanaMorae(reading);
  return morae.map((text, i) => {
    const high = isMoraPitchHigh(i, downstep);
    return { text, high, drop: high && !isMoraPitchHigh(i + 1, downstep) };
  });
}
