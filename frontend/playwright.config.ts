import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:3300",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
  webServer: [
    {
      command: "node tests/e2e/mock-backend.mjs",
      url: "http://127.0.0.1:38080/api/v1/bootstrap",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "pnpm dev --host 127.0.0.1 --port 3300",
      url: "http://127.0.0.1:3300",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { NUXT_BACKEND_INTERNAL_ORIGIN: "http://127.0.0.1:38080" },
    },
  ],
});
