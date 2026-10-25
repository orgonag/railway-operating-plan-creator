import { defineConfig } from "@playwright/test";
import development from "./playwright.config";

// Exercise the minified output and GitHub Pages subpath, including lazy exports.
// Build first: npm run build && npm run test:e2e:production.
export default defineConfig(development, {
  use: { baseURL: "http://localhost:5182/railway-operating-plan-creator/" },
  webServer: {
    command: "npm run preview -- --port 5182 --strictPort",
    url: "http://localhost:5182/railway-operating-plan-creator/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
