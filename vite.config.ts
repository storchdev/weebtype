import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

// 6494 = おうよう (応用, "application") typed on the JIS kana number row (お6 う4 よ9 う4)
export const API_PORT = Number(process.env.WEEBTYPE_PORT ?? 6494);

// The web build can't self-host the fonts: fontsource splits each Japanese font into ~120
// unicode-range files (≈2,900 in all, itch.io allows 1,000), so it links the same families
// and weights from Google Fonts instead. Keep in sync with the imports in src/lib/fonts.ts.
const GOOGLE_FONTS = `https://fonts.googleapis.com/css2?${[
  "Noto+Sans+JP:wght@400;500",
  "Noto+Serif+JP:wght@400;600",
  "Klee+One:wght@400;600",
  "Zen+Maru+Gothic:wght@400",
  "Shippori+Mincho:wght@400;600",
  "M+PLUS+1+Code:wght@400",
  "Yuji+Syuku",
  "Dela+Gothic+One",
]
  .map((f) => `family=${f}`)
  .join("&")}&display=swap`;

function googleFonts(): Plugin {
  const EMPTY = "\0no-fontsource";
  return {
    name: "weebtype-google-fonts",
    enforce: "pre",
    resolveId: (id) => (id.startsWith("@fontsource/") ? EMPTY : null),
    load: (id) => (id === EMPTY ? "export {};" : null),
    transformIndexHtml: () => [
      { tag: "link", attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" }, injectTo: "head" },
      {
        tag: "link",
        attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        injectTo: "head",
      },
      { tag: "link", attrs: { rel: "stylesheet", href: GOOGLE_FONTS }, injectTo: "head" },
    ],
  };
}

// `--mode static`: the server-less web build (scripts/build-static.ts) with relative asset
// paths, so it works from any subpath (itch.io, GitHub Pages).
export default defineConfig(({ mode }) => {
  const isStatic = mode === "static";
  return {
    plugins: [svelte(), ...(isStatic ? [googleFonts()] : [])],
    base: isStatic ? "./" : "/",
    define: { __STATIC__: JSON.stringify(isStatic) },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: { "/api": `http://127.0.0.1:${API_PORT}` },
    },
    build: { outDir: isStatic ? "dist-static" : "dist", emptyOutDir: true },
  };
});
