import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /m003-live\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.M003_FRONTEND_ORIGIN ?? "http://127.0.0.1:50959",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
