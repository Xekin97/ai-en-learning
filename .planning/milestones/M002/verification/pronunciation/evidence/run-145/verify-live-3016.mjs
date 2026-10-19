import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(
  "/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json",
);
const { chromium } = require("@playwright/test");
const origin = "http://localhost:3016";
const batchId = "01a14352-828b-743a-b0fb-09bc1d6d85ee";
const evidenceDir =
  "/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002/verification/pronunciation/evidence/run-145";
const privateValues = JSON.parse(
  await readFile(
    "/private/tmp/wordweave-m002-cr313-uat-20261016/uat-private.json",
    "utf8",
  ),
);
const profile =
  "/private/tmp/wordweave-m002-cr313-uat-20261016/chrome-profile-pronunciation-post-switch";
await mkdir(evidenceDir, { recursive: true });
const assertions = [];
const requests = [];
function check(id, condition, actual, expected) {
  assertions.push({ id, pass: Boolean(condition), actual, expected });
  if (!condition) throw new Error(`${id}: expected ${expected}; actual ${actual}`);
}

let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  await context.addInitScript(() => {
    const synth = window.speechSynthesis;
    const originalSpeak = synth.speak.bind(synth);
    const records = [];
    Object.defineProperty(window, "__qaLiveSpeech", {
      value: records,
      configurable: false,
    });
    synth.speak = (utterance) => {
      const record = {
        entryMatches:
          document.activeElement?.getAttribute?.("data-pron-entry") ===
          utterance.text,
        entryCodepoints: [...utterance.text].length,
        voiceLang: utterance.voice?.lang ?? null,
        events: [],
      };
      for (const type of ["start", "end", "error"])
        utterance.addEventListener(type, (event) =>
          record.events.push({
            type,
            error:
              type === "error" && typeof event.error === "string"
                ? event.error
                : null,
            at: performance.now(),
          }),
        );
      records.push(record);
      return originalSpeak(utterance);
    };
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    requests.push({ method: request.method(), path: url.pathname });
  });

  await page.goto(`${origin}/login`, { waitUntil: "networkidle" });
  await page.locator('[name="username"]').fill(privateValues.learner_username);
  await page.locator('[name="password"]').fill(privateValues.learner_password);
  await page.locator('[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== "/login");
  check("NORMAL-LEARNER-LOGIN", true, true, true);

  await page.goto(`${origin}/library/${batchId}`, { waitUntil: "networkidle" });
  const actions = page.locator("[data-pronunciation-action]");
  const controlCount = await actions.count();
  check("REAL-SAVED-ARTICLE", controlCount > 0, controlCount, ">0 controls");
  const beforeGesture = await page.evaluate(() => window.__qaLiveSpeech.length);
  check("NO-AUTOPLAY", beforeGesture === 0, beforeGesture, 0);

  const boundary = requests.length;
  await actions.first().focus();
  await actions.first().click();
  await page.waitForFunction(
    () =>
      window.__qaLiveSpeech[0]?.events.some((event) => event.type === "end"),
    undefined,
    { timeout: 15000 },
  );
  const speech = await page.evaluate(() => window.__qaLiveSpeech[0]);
  check(
    "REAL-NATIVE-START-END",
    speech.entryMatches &&
      speech.events.some((event) => event.type === "start") &&
      speech.events.some((event) => event.type === "end"),
    JSON.stringify(speech),
    "current entry + native start/end",
  );
  const scopedRequests = requests.slice(boundary);
  const businessWrites = scopedRequests.filter(
    (request) => !["GET", "HEAD", "OPTIONS"].includes(request.method),
  );
  check("PLAYBACK-NO-BUSINESS-WRITE", businessWrites.length === 0, businessWrites.length, 0);
  check(
    "NO-PAGE-ERROR",
    pageErrors.length === 0 && consoleErrors.length === 0,
    JSON.stringify({ pageErrors, consoleErrors }),
    0,
  );
  const result = {
    version: "M002-QA-PRON-01-R1",
    origin,
    status: assertions.every((item) => item.pass) ? "PASS" : "FAIL",
    normalLogin: true,
    savedBatchId: batchId,
    controlCount,
    assertions,
    speech,
    playbackRequests: scopedRequests,
    pageErrors,
    consoleErrors,
    humanAudibility: "PENDING_USER_UAT",
    realPhone: "PENDING_USER_UAT",
  };
  await writeFile(
    path.join(evidenceDir, "live-3016-smoke.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify({ status: result.status, assertions: assertions.length, controlCount }));
} finally {
  await context?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
