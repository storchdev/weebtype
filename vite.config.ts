import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export const API_PORT = Number(process.env.WEEBTYPE_PORT ?? 5174);

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
