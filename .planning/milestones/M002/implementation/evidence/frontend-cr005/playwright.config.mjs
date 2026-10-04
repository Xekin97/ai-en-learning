import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(join(process.cwd(), 'package.json'));
const { defineConfig, devices } = require('@playwright/test');
const out = (name) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  testDir: join(process.cwd(), 'tests/e2e'),
  testMatch: /m002-review.*\.spec\.ts$/,
  // Original first test writes a frozen delivery screenshot. The new case covers its relevant flow.
  grepInvert: /partial answers, overview editing/,
  timeout: 60000,
  workers: 1,
  outputDir: out('browser-results'),
  reporter: [['list'], ['json', { outputFile: out('browser-results.json') }]],
  use: { baseURL: 'http://127.0.0.1:3334', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 320, height: 760 } } },
    { name: 'firefox', testMatch: /m002-review-storage\.spec\.ts$/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: /m002-review-storage\.spec\.ts$/, use: { ...devices['Desktop Safari'] } },
  ],
});
