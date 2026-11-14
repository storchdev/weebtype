import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// 6494 = おうよう (応用, "application") typed on the JIS kana number row (お6 う4 よ9 う4)
export const API_PORT = Number(process.env.WEEBTYPE_PORT ?? 6494);

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${API_PORT}` },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
