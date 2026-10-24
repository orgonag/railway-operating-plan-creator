import { defineConfig } from "vite";

/**
 * The editor app. In production builds the site lives under the repository
 * name on GitHub Pages, so assets are served from that base; in dev it is "/".
 */
export default defineConfig(({ mode }) => ({
  root: "app",
  base: mode === "production" ? "/railway-operating-plan-creator/" : "/",
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
}));
