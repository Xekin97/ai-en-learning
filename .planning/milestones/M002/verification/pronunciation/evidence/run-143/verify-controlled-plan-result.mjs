import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(
  "/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json",
);
const { chromium } = require("@playwright/test");

const publicOrigin = "http://localhost:3019";
const evidenceDir =
  "/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002/verification/pronunciation/evidence/run-143";
const privatePath =
  "/private/tmp/wordweave-m002-cr313-uat-20261016/uat-private.json";
const profilePath =
  "/private/tmp/wordweave-m002-pronunciation-candidate-20261016/chrome-profile-plan-qa143";

await mkdir(evidenceDir, { recursive: true });
const privateValues = JSON.parse(await readFile(privatePath, "utf8"));
const assertions = [];
const requests = [];

function check(id, condition, actual, expected) {
  assertions.push({ id, pass: Boolean(condition), actual, expected });
  if (!condition) throw new Error(`${id}: expected ${expected}; actual ${actual}`);
}

let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  await context.addInitScript(() => {
    const synth = window.speechSynthesis;
    const originalSpeak = synth.speak.bind(synth);
    const originalCancel = synth.cancel.bind(synth);
    const evidence = { speaks: [], cancels: [] };
    Object.defineProperty(window, "__qaControlledSpeech", {
      value: evidence,
      configurable: false,
    });
    synth.speak = (utterance) => {
      const active = document.activeElement?.closest?.(
        "[data-pronunciation-action]",
      );
      const record = {
        surface: active?.closest?.("[data-pron-control]")?.getAttribute(
          "data-pron-surface",
        ),
        entryMatches:
          active?.getAttribute("data-pron-entry") === utterance.text,
        entryCodepoints: [...utterance.text].length,
        voiceLang: utterance.voice?.lang ?? null,
        events: [],
      };
      for (const type of ["start", "end", "error"]) {
        utterance.addEventListener(type, (event) => {
          record.events.push({
            type,
            error:
              type === "error" && typeof event.error === "string"
                ? event.error
                : null,
            at: performance.now(),
          });
        });
      }
      evidence.speaks.push(record);
      return originalSpeak(utterance);
    };
    synth.cancel = () => {
      evidence.cancels.push({ at: performance.now() });
      return originalCancel();
    };
  });

  const page = context.pages()[0] ?? (await context.newPage());
  page.on("request", (request) => {
    const parsed = new URL(request.url());
    requests.push({
      method: request.method(),
      path: `${parsed.pathname}${parsed.search}`,
    });
  });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(`${publicOrigin}/login`, { waitUntil: "networkidle" });
  await page.locator('[name="username"]').fill(privateValues.learner_username);
  await page.locator('[name="password"]').fill(privateValues.learner_password);
  await page.locator('[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.goto(`${publicOrigin}/create`, { waitUntil: "networkidle" });
  const requestBoundary = requests.length;

  const injection = await page.evaluate(() => {
    const nuxt = document.querySelector("#__nuxt")?.__vue_app__?.config
      ?.globalProperties?.$nuxt;
    const workspace = nuxt?.payload?.state?.["$sgeneration-workspace"];
    if (!workspace) return { injected: false };
    const generation = workspace.generation;
    generation.phase = "streaming";
    generation.runId = "qa-controlled-run";
    generation.requestPhase = "planning";
    generation.planId = "qa-controlled-plan";
    generation.planMeaningLanguage = "en";
    generation.requestedEntries = ["responsibility"];
    generation.requestedMeaningLanguage = "en";
    generation.draft.draftId = "qa-controlled-draft";
    generation.draftId = "qa-controlled-draft";
    generation.planItems = [
      { kind: "scene", text: "Controlled QA scene." },
      {
        kind: "word_use",
        entry: "responsibility",
        form: "responsibility",
        sense: "a duty",
        phrase: "take responsibility",
      },
    ];
    return { injected: true };
  });
  check("CONTROLLED-INJECTION", injection.injected, injection.injected, true);

  const plan = page.locator("#planning-preview");
  await plan.waitFor({ state: "visible" });
  const planActions = plan.locator("[data-pronunciation-action]");
  check("PLAN-CONTROL", (await planActions.count()) === 1, await planActions.count(), 1);
  check("PLAN-SURFACE", (await plan.locator("[data-pron-control]").getAttribute("data-pron-surface")) === "generation-plan:qa-controlled-draft", await plan.locator("[data-pron-control]").getAttribute("data-pron-surface"), "generation-plan:qa-controlled-draft");
  check("PICKER-EXCLUDED", (await page.locator(".word-picker [data-pron-control]").count()) === 0, await page.locator(".word-picker [data-pron-control]").count(), 0);

  await planActions.focus();
  await planActions.click();
  await page.waitForFunction(
    () =>
      window.__qaControlledSpeech.speaks[0]?.events.some(
        (event) => event.type === "start",
      ),
    undefined,
    { timeout: 5000 },
  );
  const beforeTransition = await page.evaluate(() => ({
    cancels: window.__qaControlledSpeech.cancels.length,
    activeSurface: document.activeElement
      ?.closest?.("[data-pron-control]")
      ?.getAttribute("data-pron-surface"),
  }));
  check("PLAN-FOCUS-BEFORE-TRANSITION", beforeTransition.activeSurface === "generation-plan:qa-controlled-draft", beforeTransition.activeSurface, "generation-plan:qa-controlled-draft");

  await page.evaluate(() => {
    const nuxt = document.querySelector("#__nuxt").__vue_app__.config
      .globalProperties.$nuxt;
    const generation =
      nuxt.payload.state["$sgeneration-workspace"].generation;
    const passage = "We take responsibility.";
    generation.requestPhase = "finalizing";
    generation.planItems = [];
    generation.draft.published = passage;
    generation.draft.working = passage;
    generation.draft.publishedParagraphs = [passage];
    generation.draft.bodyComplete = true;
    generation.phase = "valid";
    generation.result = {
      passage,
      passageSegments: [
        { kind: "text", text: "We take " },
        { kind: "target", text: "responsibility" },
        { kind: "text", text: "." },
      ],
      tags: ["controlled-qa"],
      targets: [
        {
          entry: "responsibility",
          entryMeaning: "a duty",
          hintPhrase: "take responsibility",
          hintSegments: [{ kind: "text", text: "take responsibility" }],
        },
      ],
    };
    generation.finalContentVersion = 1;
    generation.contentOutcome = "basic";
    generation.completionNotice = null;
    generation.canSave = false;
  });

  await page.locator("#final-result").waitFor({ state: "visible" });
  const transition = await page.evaluate(() => {
    const planNode = document.getElementById("planning-preview");
    const result = document.getElementById("final-result");
    const active = document.activeElement?.closest?.(
      "[data-pronunciation-action]",
    );
    return {
      planPresent: Boolean(planNode),
      planInert: planNode?.hasAttribute("inert") ?? null,
      planAriaHidden: planNode?.getAttribute("aria-hidden") ?? null,
      planActionDisabled:
        planNode?.querySelector("[data-pronunciation-action]")?.disabled ?? null,
      resultControlCount:
        result?.querySelectorAll("[data-pronunciation-action]").length ?? 0,
      resultSurface: result
        ?.querySelector("[data-pron-control]")
        ?.getAttribute("data-pron-surface"),
      activeSurface: active
        ?.closest?.("[data-pron-control]")
        ?.getAttribute("data-pron-surface"),
    };
  });
  check("PLAN-LEAVE-PRESENT-240MS", transition.planPresent, transition.planPresent, true);
  check("PLAN-LEAVE-INERT", transition.planInert && transition.planAriaHidden === "true" && transition.planActionDisabled, JSON.stringify(transition), "inert + aria-hidden=true + disabled");
  check("RESULT-CONTROL", transition.resultControlCount === 1, transition.resultControlCount, 1);
  check("RESULT-NEW-SURFACE", transition.resultSurface === "generation-result:qa-controlled-draft", transition.resultSurface, "generation-result:qa-controlled-draft");
  const focusSamples = [];
  for (let index = 0; index < 20; index++) {
    focusSamples.push(
      await page.evaluate(() => ({
        tag: document.activeElement?.tagName ?? null,
        surface:
          document.activeElement
            ?.closest?.("[data-pron-control]")
            ?.getAttribute("data-pron-surface") ?? null,
        planPresent: Boolean(document.getElementById("planning-preview")),
      })),
    );
    if (focusSamples.at(-1).surface === "generation-result:qa-controlled-draft")
      break;
    await page.waitForTimeout(25);
  }
  const focusSurface = focusSamples.find(
    (sample) => sample.surface === "generation-result:qa-controlled-draft",
  )?.surface;
  if (!focusSurface)
    console.log(JSON.stringify({ focusDiagnostic: { beforeTransition, transition, focusSamples } }));
  assertions.push({
    id: "FOCUS-TRANSFER",
    pass: focusSurface === "generation-result:qa-controlled-draft",
    actual: focusSurface ?? null,
    expected: "generation-result:qa-controlled-draft",
  });

  await page.waitForFunction(
    () =>
      window.__qaControlledSpeech.speaks[0]?.events.some(
        (event) => event.type === "error" || event.type === "end",
      ),
    undefined,
    { timeout: 5000 },
  );
  await page.waitForTimeout(300);
  check("PLAN-REMOVED-AFTER-240MS", (await page.locator("#planning-preview").count()) === 0, await page.locator("#planning-preview").count(), 0);

  const resultAction = page.locator("#final-result [data-pronunciation-action]");
  const resultActionState = await resultAction.evaluate((node) => ({
    disabled: node.disabled,
    ancestorInert: Boolean(node.closest("[inert]")),
    connected: node.isConnected,
  }));
  check(
    "RESULT-ACTION-ENABLED",
    !resultActionState.disabled && !resultActionState.ancestorInert && resultActionState.connected,
    JSON.stringify(resultActionState),
    "connected + enabled + outside inert region",
  );
  await resultAction.click();
  await page.waitForFunction(
    () =>
      window.__qaControlledSpeech.speaks[1]?.events.some(
        (event) => event.type === "end",
      ),
    undefined,
    { timeout: 15000 },
  );

  const speech = await page.evaluate(() => window.__qaControlledSpeech);
  check("PLAN-CANCELLED-ON-LEAVE", speech.cancels.length > beforeTransition.cancels, speech.cancels.length, `>${beforeTransition.cancels}`);
  check("PLAN-NATIVE-INTERRUPTED", speech.speaks[0].events.some((event) => event.type === "start") && speech.speaks[0].events.some((event) => event.type === "error" && ["interrupted", "canceled", "cancelled"].includes(event.error)), JSON.stringify(speech.speaks[0].events), "start then intentional interruption");
  check("RESULT-NATIVE-START-END", speech.speaks[1].entryMatches && speech.speaks[1].events.some((event) => event.type === "start") && speech.speaks[1].events.some((event) => event.type === "end"), JSON.stringify(speech.speaks[1]), "entry match + native start/end");

  const scopedRequests = requests.slice(requestBoundary);
  const writes = scopedRequests.filter((request) =>
    !["GET", "HEAD", "OPTIONS"].includes(request.method),
  );
  const modelOrGeneration = scopedRequests.filter((request) =>
    /generations\/stream|model|provider/i.test(request.path),
  );
  check("NO-CONTROLLED-DB-MODEL-WRITE", writes.length === 0 && modelOrGeneration.length === 0, JSON.stringify({ writes, modelOrGeneration }), 0);
  check("NO-CONTROLLED-PAGE-ERROR", pageErrors.length === 0 && consoleErrors.length === 0, JSON.stringify({ pageErrors, consoleErrors }), 0);

  const result = {
    version: "M002-QA-PRON-01",
    status: assertions.every((assertion) => assertion.pass) ? "PASS" : "FAIL",
    method: "Controlled client-memory PAGE-402 state injection on frozen production build; real backend session/options, real browser speech, no generation request or DB write. Not final UAT evidence.",
    candidateBuildAggregate:
      "48054f4be82d69bf71cb76d3b1a5b493e3f26703347bac300dbf665cfbc63235",
    assertions,
    transition,
    resultActionState,
    focusSurface,
    focusSamples,
    speech,
    requests: scopedRequests,
    pageErrors,
    consoleErrors,
    limits: [
      "The plan/result business data is injected in browser memory and is not a generated or persisted article.",
      "Final user UAT must use the real /create flow without this injection.",
    ],
  };
  await writeFile(
    path.join(evidenceDir, "controlled-plan-result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: result.status,
      assertions: assertions.length,
      cancelCount: speech.cancels.length,
      requestCount: scopedRequests.length,
    }),
  );
} finally {
  await context?.close().catch(() => {});
  await rm(profilePath, { recursive: true, force: true }).catch(() => {});
}
