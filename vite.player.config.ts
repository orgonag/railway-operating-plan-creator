import { defineConfig } from "vite";

/** Builds the standalone player as one IIFE file the editor inlines into exported pages. */
export default defineConfig({
  build: {
    lib: {
      entry: "src/player/standalone-entry.ts",
      name: "ROPC",
      formats: ["iife"],
      fileName: () => "player.iife.js"
    },
    outDir: "app/generated",
    emptyOutDir: true,
    minify: true,
    sourcemap: false
  }
});
