import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /m003-cr306-live\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: [
    [
      "json",
      {
        outputFile:
          "../tmp/browser-evidence/M002-legacy-M003/cr306-frontend/cross-layer-results.json",
      },
    ],
  ],
  use: {
    baseURL: process.env.CR306_FRONTEND_ORIGIN ?? "http://127.0.0.1:3317",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
