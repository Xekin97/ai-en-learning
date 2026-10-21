import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /m002-config-portability-real\.spec\.ts$/,
  outputDir:
    "../tmp/browser-evidence/M002/config-portability/playwright-real-artifacts",
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:43130",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "NUXT_BUILD_DIR=.nuxt-cr313-real NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:43131 pnpm dev --host 127.0.0.1 --port 43130",
    url: "http://127.0.0.1:43130",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
