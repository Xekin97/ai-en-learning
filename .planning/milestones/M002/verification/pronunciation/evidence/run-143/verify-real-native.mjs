import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(
  "/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json",
);
const { chromium } = require("@playwright/test");

const publicOrigin = "http://localhost:3019";
const batchId = "01a14352-828b-743a-b0fb-09bc1d6d85ee";
const evidenceDir =
  "/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002/verification/pronunciation/evidence/run-143";
const privatePath =
  "/private/tmp/wordweave-m002-cr313-uat-20261016/uat-private.json";
const profilePath =
  "/private/tmp/wordweave-m002-pronunciation-candidate-20261016/chrome-profile-qa143";

await mkdir(evidenceDir, { recursive: true });
const privateValues = JSON.parse(await readFile(privatePath, "utf8"));
const assertions = [];
const requests = [];
const pageErrors = [];
const consoleErrors = [];

function check(id, condition, actual, expected) {
  assertions.push({ id, pass: Boolean(condition), actual, expected });
  if (!condition) throw new Error(`${id}: expected ${expected}; actual ${actual}`);
}

function safePath(url) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
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
    const evidence = {
      native: true,
      speakCalls: [],
      cancelCalls: [],
      stateChanges: [],
    };
    Object.defineProperty(window, "__qaPronEvidence", {
      value: evidence,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    synth.speak = (utterance) => {
      const active = document.activeElement?.closest?.(
        "[data-pronunciation-action]",
      );
      const expected = active?.getAttribute("data-pron-entry") ?? null;
      const record = {
        sequence: evidence.speakCalls.length + 1,
        entryMatchesActiveControl:
          expected === null ? null : utterance.text === expected,
        entryCodepoints: [...utterance.text].length,
        lang: utterance.lang || null,
        voiceLang: utterance.voice?.lang || null,
        voiceDefault: utterance.voice?.default ?? null,
        voiceLocalService: utterance.voice?.localService ?? null,
        speakAt: performance.now(),
        events: [],
      };
      for (const type of ["start", "end", "error", "pause", "resume"]) {
        utterance.addEventListener(type, (event) => {
          record.events.push({
            type,
            at: performance.now(),
            error:
              type === "error" && typeof event.error === "string"
                ? event.error
                : null,
          });
        });
      }
      evidence.speakCalls.push(record);
      return originalSpeak(utterance);
    };
    synth.cancel = () => {
      evidence.cancelCalls.push({ at: performance.now() });
      return originalCancel();
    };

    addEventListener("DOMContentLoaded", () => {
      const observer = new MutationObserver((records) => {
        for (const mutation of records) {
          if (
            mutation.type === "attributes" &&
            mutation.attributeName === "data-play-state"
          ) {
            const element = mutation.target;
            evidence.stateChanges.push({
              index: [
                ...document.querySelectorAll("[data-pronunciation-action]"),
              ].indexOf(element),
              state: element.getAttribute("data-play-state"),
              at: performance.now(),
            });
          }
        }
      });
      observer.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-play-state"],
      });
    });
  });

  const page = context.pages()[0] ?? (await context.newPage());
  page.on("request", (request) => {
    requests.push({
      at: Date.now(),
      method: request.method(),
      path: safePath(request.url()),
      resourceType: request.resourceType(),
    });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(`${publicOrigin}/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="username"]').fill(privateValues.learner_username);
  await page.locator('input[name="password"]').fill(privateValues.learner_password);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/auth/login") &&
      response.request().method() === "POST",
  );
  await page.locator('button[type="submit"]').click();
  const loginResponse = await loginResponsePromise;
  check("LOGIN-REAL-200", loginResponse.status() === 200, loginResponse.status(), 200);

  const detailResponse = await page.goto(`${publicOrigin}/library/${batchId}`, {
    waitUntil: "networkidle",
  });
  check("LIBRARY-DETAIL-200", detailResponse?.status() === 200, detailResponse?.status(), 200);
  const actions = page.locator("[data-pronunciation-action]");
  const controlCount = await actions.count();
  check("LIBRARY-CONTROLS", controlCount > 1, controlCount, ">1");

  const voiceSummary = await page.evaluate(async () => {
    const get = () => speechSynthesis.getVoices();
    let voices = get();
    if (!voices.length) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        speechSynthesis.addEventListener(
          "voiceschanged",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
      voices = get();
    }
    const english = voices.filter((voice) =>
      voice.lang.toLowerCase().startsWith("en"),
    );
    return {
      total: voices.length,
      english: english.length,
      locales: [...new Set(english.map((voice) => voice.lang))].sort(),
      defaults: english.filter((voice) => voice.default).length,
      localServices: english.filter((voice) => voice.localService).length,
    };
  });
  check("REAL-ENGLISH-VOICE", voiceSummary.english > 0, voiceSummary.english, ">0");

  const ui = await actions.evaluateAll((elements) =>
    elements.map((button) => {
      const style = getComputedStyle(button);
      const icon = button.querySelector("svg");
      const iconRect = icon?.getBoundingClientRect();
      const card = button.closest("article");
      return {
        tag: button.tagName,
        type: button.getAttribute("type"),
        ariaPressed: button.getAttribute("aria-pressed"),
        ariaLabelPresent: Boolean(button.getAttribute("aria-label")),
        ariaLabelMatchesEntry: button
          .getAttribute("aria-label")
          ?.includes(button.getAttribute("data-pron-entry") ?? ""),
        title: button.getAttribute("title"),
        iconWidth: iconRect?.width ?? null,
        iconHeight: iconRect?.height ?? null,
        borderWidth: style.borderWidth,
        padding: style.padding,
        margin: style.margin,
        backgroundColor: style.backgroundColor,
        visibleText: [...button.closest("[data-pron-control]").querySelectorAll("*")]
          .filter((element) => {
            const computed = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              element.children.length === 0 &&
              element.textContent?.trim() &&
              computed.display !== "none" &&
              computed.visibility !== "hidden" &&
              rect.width > 1 &&
              rect.height > 1
            );
          })
          .map((element) => element.textContent.trim()),
        cardHeight: card?.getBoundingClientRect().height ?? null,
      };
    }),
  );
  check("BUTTON-SEMANTICS", ui.every((item) => item.tag === "BUTTON" && item.type === "button" && item.ariaPressed === null), JSON.stringify(ui.map(({tag,type,ariaPressed})=>({tag,type,ariaPressed}))), "real button/type=button/no aria-pressed");
  check("ARIA-CURRENT-ENTRY", ui.every((item) => item.ariaLabelPresent && item.ariaLabelMatchesEntry), ui.filter((item) => !item.ariaLabelPresent || !item.ariaLabelMatchesEntry).length, 0);
  check("NO-TOOLTIP", ui.every((item) => item.title === null), ui.filter((item) => item.title !== null).length, 0);
  check("ICON-18", ui.every((item) => item.iconWidth === 18 && item.iconHeight === 18), JSON.stringify(ui.map(({iconWidth,iconHeight})=>({iconWidth,iconHeight}))), "all 18x18");
  check("BARE-CONTROL", ui.every((item) => item.borderWidth === "0px" && item.padding === "0px" && item.margin === "0px" && ["rgba(0, 0, 0, 0)", "transparent"].includes(item.backgroundColor)), ui.filter((item) => !(item.borderWidth === "0px" && item.padding === "0px" && item.margin === "0px")).length, 0);
  const allowedVisibleLabels = new Set(["UK", "US", "Pronunciation"]);
  check("NO-VISIBLE-STATE-TEXT", ui.every((item) => item.visibleText.every((value) => allowedVisibleLabels.has(value))), JSON.stringify(ui.map((item) => item.visibleText)), "only actual accent labels may be visible");

  const sourceTriggers = page.locator(".pron-menu-trigger");
  const sourceTriggerCount = await sourceTriggers.count();
  check("ACTUAL-MULTI-ACCENT", sourceTriggerCount > 0, sourceTriggerCount, ">0 actual multi-accent controls");
  await sourceTriggers.first().click();
  const openMenu = page.locator('[role="menu"]:visible').first();
  const menuItems = openMenu.locator('[role="menuitemradio"]');
  const menuItemCount = await menuItems.count();
  const checkedMenuItemCount = await openMenu
    .locator('[role="menuitemradio"][aria-checked="true"]')
    .count();
  check("ACTUAL-ACCENT-MENU", menuItemCount > 1, menuItemCount, ">1 representative actual locale options");
  check("ACTUAL-ACCENT-CHECKED", checkedMenuItemCount === 1, checkedMenuItemCount, 1);
  await menuItems.first().press("End");
  check("ACCENT-END-FOCUS", await menuItems.last().evaluate((element) => element === document.activeElement), true, true);
  await menuItems.last().press("Home");
  check("ACCENT-HOME-FOCUS", await menuItems.first().evaluate((element) => element === document.activeElement), true, true);
  await menuItems.first().press("Escape");
  check("ACCENT-ESCAPE-FOCUS", await sourceTriggers.first().evaluate((element) => element === document.activeElement), true, true);

  await page.locator(".study-resources").screenshot({
    path: path.join(evidenceDir, "library-desktop-real.png"),
    mask: [page.locator(".study-resources h3, .study-resources p")],
    maskColor: "#d9d9d9",
  });

  const startRequestIndex = requests.length;
  await actions.nth(0).click();
  await page.waitForFunction(
    () =>
      window.__qaPronEvidence?.speakCalls?.[0]?.events?.some(
        (event) => event.type === "start",
      ),
    undefined,
    { timeout: 5000 },
  );
  const playingGeometry = await actions.nth(0).evaluate((button) => ({
    state: button.getAttribute("data-play-state"),
    cardHeight: button.closest("article")?.getBoundingClientRect().height ?? null,
    visibleSource: button
      .closest("[data-pron-control]")
      ?.querySelector("[data-pron-source]")
      ?.textContent?.trim() ?? null,
  }));
  await page.waitForFunction(
    () =>
      window.__qaPronEvidence?.speakCalls?.[0]?.events?.some(
        (event) => event.type === "end",
      ),
    undefined,
    { timeout: 15000 },
  );
  check("NATIVE-FIRST-PLAYING", playingGeometry.state === "playing", playingGeometry.state, "playing after native start");
  check("NO-GEOMETRY-SHIFT", Math.abs((playingGeometry.cardHeight ?? 0) - (ui[0].cardHeight ?? 0)) < 0.01, Math.abs((playingGeometry.cardHeight ?? 0) - (ui[0].cardHeight ?? 0)), "<0.01 CSS px");
  check("PLAYING-NO-STATE-TEXT", playingGeometry.visibleSource === null || allowedVisibleLabels.has(playingGeometry.visibleSource), playingGeometry.visibleSource, "no visible playing/preparing/status text");

  const beforeAB = await page.evaluate(() => ({
    speaks: window.__qaPronEvidence.speakCalls.length,
    cancels: window.__qaPronEvidence.cancelCalls.length,
  }));
  await actions.nth(0).click();
  await page.waitForFunction(
    () =>
      window.__qaPronEvidence?.speakCalls?.[1]?.events?.some(
        (event) => event.type === "start",
      ),
    undefined,
    { timeout: 5000 },
  );
  await actions.nth(1).click();
  await page.waitForFunction(
    () =>
      window.__qaPronEvidence?.speakCalls?.[2]?.events?.some(
        (event) => event.type === "start",
      ),
    undefined,
    { timeout: 5000 },
  );

  const beforeReplay = await page.evaluate(() => ({
    speaks: window.__qaPronEvidence.speakCalls.length,
    cancels: window.__qaPronEvidence.cancelCalls.length,
  }));
  await actions.nth(1).click();
  await page.waitForFunction(
    (count) =>
      window.__qaPronEvidence?.speakCalls?.length > count &&
      window.__qaPronEvidence.speakCalls.at(-1).events.some(
        (event) => event.type === "start",
      ),
    beforeReplay.speaks,
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () =>
      window.__qaPronEvidence.speakCalls.at(-1).events.some(
        (event) => event.type === "end",
      ),
    undefined,
    { timeout: 15000 },
  );

  const beforeLeave = await page.evaluate(() => ({
    speaks: window.__qaPronEvidence.speakCalls.length,
    cancels: window.__qaPronEvidence.cancelCalls.length,
  }));
  await actions.nth(0).click();
  await page.waitForFunction(
    (count) =>
      window.__qaPronEvidence?.speakCalls?.length > count &&
      window.__qaPronEvidence.speakCalls.at(-1).events.some(
        (event) => event.type === "start",
      ),
    beforeLeave.speaks,
    { timeout: 5000 },
  );
  const afterLeaveStart = await page.evaluate(() => ({
    speaks: window.__qaPronEvidence.speakCalls.length,
    cancels: window.__qaPronEvidence.cancelCalls.length,
  }));
  const beforeRouteRequestIndex = requests.length;
  await page.locator('a[href="/library"]').first().click();
  await page.waitForURL(`${publicOrigin}/library`);
  await page.waitForFunction(
    () =>
      window.__qaPronEvidence.speakCalls.at(-1).events.some(
        (event) => event.type === "error" || event.type === "end",
      ),
    undefined,
    { timeout: 5000 },
  );

  const lifecycle = await page.evaluate(() => window.__qaPronEvidence);
  check("CURRENT-ENTRY-ONLY", lifecycle.speakCalls.every((call) => call.entryMatchesActiveControl === true), lifecycle.speakCalls.filter((call) => call.entryMatchesActiveControl !== true).length, 0);
  const firstFour = lifecycle.speakCalls.slice(0, 4);
  const normalEnded = [firstFour[0], firstFour[3]].every(
    (call) =>
      call.events.some((event) => event.type === "start") &&
      call.events.some((event) => event.type === "end"),
  );
  const interruptedCalls = [firstFour[1], firstFour[2]];
  const replacementsInterrupted = interruptedCalls.every(
    (call) =>
      call.events.some((event) => event.type === "start") &&
      call.events.some(
        (event) =>
          event.type === "error" &&
          ["interrupted", "canceled", "cancelled"].includes(event.error),
      ),
    );
  const leaveCall = lifecycle.speakCalls[4];
  const leaveInterrupted =
    leaveCall.events.some((event) => event.type === "start") &&
    leaveCall.events.some(
      (event) =>
        event.type === "error" &&
        ["interrupted", "canceled", "cancelled"].includes(event.error),
    );
  check("NATIVE-NORMAL-START-END", normalEnded, JSON.stringify(firstFour.map((call) => call.events.map((event) => ({ type: event.type, error: event.error })))), "initial and replay calls have native start/end");
  check("NATIVE-REPLACEMENTS-INTERRUPTED", replacementsInterrupted, JSON.stringify(interruptedCalls.map((call) => call.events.map((event) => ({ type: event.type, error: event.error })))), "A-to-B old A and playing B-to-replay old B terminate as intentional interruption");
  check("NATIVE-LEAVE-INTERRUPTED", leaveInterrupted, JSON.stringify(leaveCall.events.map((event) => ({ type: event.type, error: event.error }))), "route-leaving active utterance terminates as intentional interruption");
  check("A-TO-B-CANCEL", beforeReplay.cancels > beforeAB.cancels, beforeReplay.cancels, `>${beforeAB.cancels}`);
  check("REPLAY-CANCELS-OLD", beforeLeave.cancels > beforeReplay.cancels, beforeLeave.cancels, `>${beforeReplay.cancels}`);
  check("ROUTE-LEAVE-CANCEL", lifecycle.cancelCalls.length > afterLeaveStart.cancels, lifecycle.cancelCalls.length, `>${afterLeaveStart.cancels}`);

  const playbackRequests = requests.slice(startRequestIndex, beforeRouteRequestIndex);
  const routeLeaveRequests = requests.slice(beforeRouteRequestIndex);
  const forbiddenRequests = playbackRequests.filter((request) =>
    /dictionary|pronunciation|audio|recording|model|generation|upgrade/i.test(
      request.path,
    ),
  );
  check("NO-PLAYBACK-BUSINESS-REQUEST", forbiddenRequests.length === 0, JSON.stringify(forbiddenRequests), 0);
  check("NO-PLAYBACK-WRITE", playbackRequests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method)).length === 0, JSON.stringify(playbackRequests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method))), 0);

  await page.goto(`${publicOrigin}/create`, { waitUntil: "networkidle" });
  check("PICKER-NO-PRON", (await page.locator("[data-pron-control]").count()) === 0, await page.locator("[data-pron-control]").count(), 0);
  await page.goto(`${publicOrigin}/explore`, { waitUntil: "networkidle" });
  check("EXPLORE-NO-PRON", (await page.locator("[data-pron-control]").count()) === 0, await page.locator("[data-pron-control]").count(), 0);
  await page.goto(`${publicOrigin}/review`, { waitUntil: "networkidle" });
  check("REVIEW-NO-PRON", (await page.locator("[data-pron-control]").count()) === 0, await page.locator("[data-pron-control]").count(), 0);

  await page.goto(`${publicOrigin}/library/${batchId}`, { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await page.evaluate(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    controlCount: document.querySelectorAll("[data-pron-control]").length,
    iconSizes: [...document.querySelectorAll("[data-pronunciation-action] svg")].map(
      (icon) => {
        const rect = icon.getBoundingClientRect();
        return [rect.width, rect.height];
      },
    ),
  }));
  check("NARROW-NO-OVERFLOW", mobileLayout.scrollWidth === mobileLayout.clientWidth && mobileLayout.scrollWidth <= mobileLayout.innerWidth, JSON.stringify({ scrollWidth: mobileLayout.scrollWidth, clientWidth: mobileLayout.clientWidth, innerWidth: mobileLayout.innerWidth }), "scrollWidth == clientWidth <= innerWidth");
  check("NARROW-CONTROLS", mobileLayout.controlCount === controlCount && mobileLayout.iconSizes.every(([width, height]) => width === 18 && height === 18), JSON.stringify(mobileLayout), `count=${controlCount}; icons=18x18`);
  await page.locator(".study-resources").screenshot({
    path: path.join(evidenceDir, "library-390-real.png"),
    mask: [page.locator(".study-resources h3, .study-resources p")],
    maskColor: "#d9d9d9",
  });

  check("NO-PAGE-ERROR", pageErrors.length === 0, pageErrors.length, 0);
  check("NO-CONSOLE-ERROR", consoleErrors.length === 0, consoleErrors.length, 0);

  const sanitizedLifecycle = {
    native: lifecycle.native,
    speakCalls: lifecycle.speakCalls.map((call) => ({
      ...call,
      entryDigest: createHash("sha256")
        .update(String(call.sequence) + ":" + String(call.entryCodepoints))
        .digest("hex")
        .slice(0, 12),
    })),
    cancelCalls: lifecycle.cancelCalls,
    stateChanges: lifecycle.stateChanges,
  };
  const result = {
    version: "M002-QA-PRON-01",
    candidate: {
      publicOrigin,
      frontendPort: 3018,
      backendPort: 43331,
      buildAggregate:
        "48054f4be82d69bf71cb76d3b1a5b493e3f26703347bac300dbf665cfbc63235",
    },
    browser: {
      engine: "Google Chrome via Playwright channel=chrome",
      headless: false,
      locale: "en-US",
      viewportDesktop: [1440, 900],
      viewportNarrowLayoutOnly: [390, 844],
    },
    voiceSummary,
    controlCount,
    actualAccentMenu: {
      sourceTriggerCount,
      menuItemCount,
    },
    lifecycle: sanitizedLifecycle,
    requestSummary: {
      playbackRequestCount: playbackRequests.length,
      methods: [...new Set(playbackRequests.map((request) => request.method))],
      forbiddenCount: forbiddenRequests.length,
      paths: [...new Set(playbackRequests.map((request) => request.path))],
      routeLeavePaths: [...new Set(routeLeaveRequests.map((request) => request.path))],
    },
    assertions,
    pageErrors,
    consoleErrors,
    result: assertions.every((assertion) => assertion.pass) ? "PASS" : "FAIL",
    limits: [
      "Native start/end proves browser integration events, not human audibility.",
      "390px is layout evidence only, not a real mobile-device test.",
      "PAGE-402 real model generation was not invoked by QA.",
    ],
  };
  await writeFile(
    path.join(evidenceDir, "real-native-results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      result: result.result,
      assertions: assertions.length,
      voiceSummary,
      controlCount,
      nativeSpeakCalls: lifecycle.speakCalls.length,
      nativeCancelCalls: lifecycle.cancelCalls.length,
      playbackRequestCount: playbackRequests.length,
    }),
  );
} finally {
  await context?.close().catch(() => {});
  await rm(profilePath, { recursive: true, force: true }).catch(() => {});
}
