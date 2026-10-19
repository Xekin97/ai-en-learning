import { defineConfig, devices } from "@playwright/test";

const sourceRoot = process.env.CR306_FRONTEND_ROOT;
if (!sourceRoot)
  throw new Error(
    "CR306_FRONTEND_ROOT must name an isolated frontend source copy",
  );

const uiPort = process.env.CR306_UI_PORT ?? "3316";
const mockPort = process.env.CR306_MOCK_PORT ?? "38106";
const uiOrigin = `http://127.0.0.1:${uiPort}`;
const mockOrigin = `http://127.0.0.1:${mockPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /m003-cr306-models\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: [
    [
      "json",
      {
        outputFile:
          "../.planning/milestones/M002-legacy-M003/implementation/evidence/cr306-frontend/browser-results-isolated.json",
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
      command: `WORDWEAVE_MOCK_PORT=${mockPort} node tests/e2e/mock-backend.mjs`,
      url: `${mockOrigin}/api/v1/bootstrap`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm --dir "${sourceRoot}" dev --host 127.0.0.1 --port ${uiPort}`,
      url: uiOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NUXT_BACKEND_INTERNAL_ORIGIN: mockOrigin },
    },
  ],
});
