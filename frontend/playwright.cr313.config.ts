import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /m002-config-portability\.spec\.ts$/,
  workers: 1,
  outputDir:
    "../tmp/browser-evidence/M002/config-portability/playwright-artifacts",
  use: {
    baseURL: "http://127.0.0.1:43130",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 950 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command: "WORDWEAVE_MOCK_PORT=43131 node tests/e2e/mock-backend.mjs",
      url: "http://127.0.0.1:43131/api/v1/bootstrap",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        "NUXT_BUILD_DIR=.nuxt-cr313 NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:43131 pnpm dev --host 127.0.0.1 --port 43130",
      url: "http://127.0.0.1:43130",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
