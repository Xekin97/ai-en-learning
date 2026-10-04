import { createRequire } from "node:module";
const {defineConfig}=createRequire("/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json")("@playwright/test");
export default defineConfig({
  "testDir": "/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/tests/e2e",
  "testMatch": "m002-uat-fixes.spec.ts",
  "fullyParallel": false,
  "workers": 1,
  "retries": 0,
  "timeout": 30000,
  "outputDir": "/var/folders/z9/99ckxr957v901zwwc8jdk8640000gn/T/wordweave-cr023-browser-r8ow6ghq/test-results",
  "reporter": [
    [
      "json",
      {
        "outputFile": "/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002/implementation/evidence/frontend-cr023/browser-results.json"
      }
    ]
  ],
  "use": {
    "baseURL": "http://127.0.0.1:3313",
    "trace": "retain-on-failure"
  },
  "projects": [
    {
      "name": "chromium1440",
      "use": {
        "browserName": "chromium",
        "viewport": {
          "width": 1440,
          "height": 1000
        }
      }
    },
    {
      "name": "webkit390",
      "use": {
        "browserName": "webkit",
        "viewport": {
          "width": 390,
          "height": 900
        }
      }
    }
  ]
});
