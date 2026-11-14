// Kana / script helpers.

const KATA_START = 0x30a1; // ァ
const KATA_END = 0x30f6; // ヶ
const KATA_TO_HIRA = 0x60;

export function toHiragana(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += c >= KATA_START && c <= KATA_END ? String.fromCodePoint(c - KATA_TO_HIRA) : ch;
  }
  return out;
}

export function isHiragana(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x3041 && c <= 0x3096;
}

export function isKatakana(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x30a1 && c <= 0x30fa) || ch === "ー";
}

export function isKana(ch: string): boolean {
  return isHiragana(ch) || isKatakana(ch);
}

export function isKanji(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || ch === "々" || ch === "〆" || ch === "ヶ"
  );
}

export function allKana(s: string): boolean {
  return [...s].every(isKana);
}

/** Japanese punctuation the user can type, with the key(s) that produce it. */
export const PUNCT_KEYS: Readonly<Record<string, readonly string[]>> = {
  "、": [","],
  "。": ["."],
  "「": ["["],
  "」": ["]"],
  "『": ["{"],
  "』": ["}"],
  "？": ["?"],
  "！": ["!"],
  ー: ["-"],
  "〜": ["~"],
  "・": ["/"],
  "：": [":"],
  "（": ["("],
  "）": [")"],
};

/** Map half-width / variant punctuation an LLM might emit to the canonical form above. */
const PUNCT_NORMALIZE: Readonly<Record<string, string>> = {
  ",": "、",
  "，": "、",
  ".": "。",
  "．": "。",
  "?": "？",
  "!": "！",
  "~": "〜",
  "～": "〜",
  "(": "（",
  ")": "）",
  ":": "：",
  "―": "ー",
  "－": "ー",
};

export function normalizePunct(ch: string): string {
  return PUNCT_NORMALIZE[ch] ?? ch;
}

export function isPunct(ch: string): boolean {
  return ch in PUNCT_KEYS && ch !== "ー";
}
