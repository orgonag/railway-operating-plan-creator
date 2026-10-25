import { defineConfig } from "@playwright/test";

/** Browser smoke tests for the editor; run with `npm run test:e2e`, not part of `npm test`. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5181",
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5181 --strictPort",
    url: "http://localhost:5181",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
