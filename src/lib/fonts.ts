// Self-hosted Google Fonts (via @fontsource). Each CSS file declares unicode-range
// subsets, so the browser only downloads the glyph chunks it actually renders.
// The static web build replaces these imports with a Google Fonts link (vite.config.ts).
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-serif-jp/400.css";
import "@fontsource/noto-serif-jp/600.css";
import "@fontsource/klee-one/400.css";
import "@fontsource/klee-one/600.css";
import "@fontsource/zen-maru-gothic/400.css";
import "@fontsource/shippori-mincho/400.css";
import "@fontsource/shippori-mincho/600.css";
import "@fontsource/m-plus-1-code/400.css";
import "@fontsource/yuji-syuku/400.css";
import "@fontsource/dela-gothic-one/400.css";

export interface FontChoice {
  id: string;
  name: string;
  family: string;
  note: string;
}

export const FONTS: readonly FontChoice[] = [
  { id: "noto-sans", name: "Noto Sans JP", family: "'Noto Sans JP', sans-serif", note: "clean gothic" },
  { id: "noto-serif", name: "Noto Serif JP", family: "'Noto Serif JP', serif", note: "classic mincho" },
  { id: "klee", name: "Klee One", family: "'Klee One', cursive", note: "pencil handwriting" },
  {
    id: "zen-maru",
    name: "Zen Maru Gothic",
    family: "'Zen Maru Gothic', sans-serif",
    note: "soft & rounded",
  },
  { id: "shippori", name: "Shippori Mincho", family: "'Shippori Mincho', serif", note: "elegant mincho" },
  { id: "mplus-code", name: "M PLUS 1 Code", family: "'M PLUS 1 Code', monospace", note: "monospaced" },
  { id: "yuji", name: "Yuji Syuku", family: "'Yuji Syuku', serif", note: "brush calligraphy" },
  { id: "dela", name: "Dela Gothic One", family: "'Dela Gothic One', sans-serif", note: "heavy display" },
];

export function fontFamily(id: string): string {
  return (FONTS.find((f) => f.id === id) ?? (FONTS[0] as FontChoice)).family;
}
