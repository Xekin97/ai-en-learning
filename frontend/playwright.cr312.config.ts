import { defineConfig, devices } from "@playwright/test";

const uiOrigin = "http://127.0.0.1:3322";
const mockOrigin = "http://127.0.0.1:38122";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /m003-cr311-312\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          "../.planning/milestones/M002-legacy-M003/implementation/evidence/cr311-312-frontend/browser-results.json",
      },
    ],
  ],
  use: { baseURL: uiOrigin, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
  webServer: [
    {
      command: "WORDWEAVE_MOCK_PORT=38122 node tests/e2e/mock-backend.mjs",
      url: `${mockOrigin}/api/v1/bootstrap`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm dev --host 127.0.0.1 --port 3322",
      url: uiOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NUXT_BACKEND_INTERNAL_ORIGIN: mockOrigin },
    },
  ],
});
