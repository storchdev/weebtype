import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export const API_PORT = Number(process.env.WEEBTYPE_PORT ?? 5174);

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${API_PORT}` },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
