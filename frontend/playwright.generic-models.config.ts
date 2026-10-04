import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "m002-generic-models.spec.ts",
  workers: 1,
  outputDir:
    "../.planning/milestones/M002/implementation/evidence/provider-workspace31/playwright",
  use: { baseURL: "http://127.0.0.1:3324", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: "node tests/e2e/mock-backend.mjs",
      url: "http://127.0.0.1:38084/api/v1/bootstrap",
      reuseExistingServer: true,
      env: { WORDWEAVE_MOCK_PORT: "38084" },
    },
    {
      command: "pnpm dev --host 127.0.0.1 --port 3324",
      url: "http://127.0.0.1:3324",
      reuseExistingServer: true,
      env: { NUXT_BACKEND_INTERNAL_ORIGIN: "http://127.0.0.1:38084" },
    },
  ],
});
