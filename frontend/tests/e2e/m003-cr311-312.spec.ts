import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { selectValue } from "./select-control";

const m002Copy = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002/design/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const copy = (locale: "zh" | "en", key: string) =>
  (m002Copy.static[`${locale}.${key}`] ??
    m002Copy.templates[`${locale}.${key}`]) as string;
const evidence =
  "../tmp/browser-evidence/M002-legacy-M003/cr311-312-frontend/screenshots";

async function ready(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}

async function configureCreate(page: Page) {
  const settings = page.locator("details.settings");
  if (!(await settings.evaluate((node) => (node as HTMLDetailsElement).open)))
    await settings.locator("summary").click();
  await selectValue(
    page.getByRole("combobox", { name: copy("zh", "model"), exact: true }),
    "model-fast",
  );
  await selectValue(
    page.getByRole("combobox", { name: copy("zh", "explain"), exact: true }),
    "en",
  );
  await page
    .getByRole("button", { name: copy("zh", "random"), exact: true })
    .click();
  await expect(page.locator(".workspace .word-token")).toContainText("adapt");
}

async function installReplacementHeightProbe(page: Page) {
  await page.evaluate(() => {
    const runtime = window as typeof window & Record<string, unknown>;
    runtime.__replacementHeightPromise = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector("[data-height-motion='220']")) return;
        observer.disconnect();
        requestAnimationFrame(() => {
          const node = document.querySelector<HTMLElement>(
            "[data-paragraph-index='0']",
          );
          const animation = node
            ?.getAnimations()
            .find((candidate) =>
              (candidate.effect as KeyframeEffect | null)
                ?.getKeyframes()
                .some((frame) => Boolean(frame.height)),
            );
          if (!node || !animation) {
            resolve(null);
            return;
          }
          const frames = (animation.effect as KeyframeEffect).getKeyframes();
          const started = performance.now();
          const samples = [
            { elapsed: 0, height: node.getBoundingClientRect().height },
          ];
          setTimeout(
            () =>
              samples.push({
                elapsed: performance.now() - started,
                height: node.getBoundingClientRect().height,
              }),
            100,
          );
          setTimeout(
            () =>
              resolve({
                duration: animation.effect?.getTiming().duration,
                frames: frames.map((frame) => frame.height).filter(Boolean),
                samples: [
                  ...samples,
                  {
                    elapsed: performance.now() - started,
                    height: node.getBoundingClientRect().height,
                  },
                ],
              }),
            250,
          );
        });
      });
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, 2_000);
    });
    runtime.__tailExitPromise = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const leaving = document.querySelector<HTMLElement>(
          ".m003-paragraph-leave-active",
        );
        if (!leaving) return;
        observer.disconnect();
        requestAnimationFrame(() => {
          const region =
            document.querySelector<HTMLElement>(".live-draft-text");
          const heightAnimation = region
            ?.getAnimations()
            .find(
              (candidate) => candidate.effect?.getTiming().duration === 180,
            );
          const duration = getComputedStyle(leaving).transitionDuration;
          const started = performance.now();
          const sample = () => ({
            elapsed: performance.now() - started,
            connected: leaving.isConnected,
            height: region?.getBoundingClientRect().height ?? null,
          });
          const samples = [sample()];
          setTimeout(() => samples.push(sample()), 80);
          setTimeout(
            () =>
              resolve({
                text: leaving.textContent,
                ariaHidden: leaving.getAttribute("aria-hidden"),
                inert: leaving.inert,
                duration,
                heightFrames: (heightAnimation?.effect as KeyframeEffect | null)
                  ?.getKeyframes()
                  .map((frame) => frame.height)
                  .filter(Boolean),
                samples: [...samples, sample()],
              }),
            210,
          );
        });
      });
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, 3_000);
    });
  });
}

async function installArrivalProbe(page: Page) {
  await page.evaluate(() => {
    const runtime = window as typeof window & Record<string, unknown>;
    const records: Array<Record<string, unknown>> = [];
    const captured = new Set<string>();
    runtime.__cr312ArrivalEvidence = records;
    const capture = (kind: string, node: HTMLElement, selector: string) => {
      if (captured.has(kind)) return;
      captured.add(kind);
      const animation = node.getAnimations()[0];
      const record: Record<string, unknown> = {
        kind,
        node,
        selector,
        textAtStart: node.textContent?.trim(),
        classAtStart: node.classList.contains("is-entering"),
        duration: animation?.effect?.getTiming().duration,
        samples: [
          {
            phase: "start",
            opacity: Number(getComputedStyle(node).opacity),
            transform: getComputedStyle(node).transform,
          },
        ],
      };
      records.push(record);
      setTimeout(() => {
        (record.samples as unknown[]).push({
          phase: "middle",
          opacity: Number(getComputedStyle(node).opacity),
          transform: getComputedStyle(node).transform,
        });
      }, 90);
      setTimeout(() => {
        Object.assign(record, {
          sameNodeAfter: document.querySelector(selector) === node,
          connectedAfter: node.isConnected,
          classAfter: node.classList.contains("is-entering"),
        });
        (record.samples as unknown[]).push({
          phase: "after",
          opacity: Number(getComputedStyle(node).opacity),
          transform: getComputedStyle(node).transform,
        });
      }, 210);
    };
    const inspect = (root: ParentNode) => {
      const candidates = [
        ...(root instanceof HTMLElement && root.matches(".is-entering")
          ? [root]
          : []),
        ...root.querySelectorAll<HTMLElement>(".is-entering"),
      ];
      for (const node of candidates) {
        if (node.id === "planning-preview")
          capture("plan-region", node, "#planning-preview");
        else if (node.classList.contains("m003-live-draft"))
          capture("draft-region", node, ".m003-live-draft");
        else if (node.dataset.planEntry)
          capture(
            "word-row",
            node,
            `[data-plan-entry='${CSS.escape(node.dataset.planEntry)}']`,
          );
      }
    };
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") inspect(mutation.target as Node);
        for (const node of mutation.addedNodes)
          if (node instanceof HTMLElement) inspect(node);
      }
    }).observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
  });
}

test.beforeEach(() => mkdirSync(evidence, { recursive: true }));

test("1440 Chinese create preserves nodes through typing, repair, and valid", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "learner",
      url: "http://127.0.0.1:3322",
    },
    {
      name: "wordweave_ui_locale",
      value: "zh-CN",
      url: "http://127.0.0.1:3322",
    },
    {
      name: "wordweave_cr312_rich",
      value: "1",
      url: "http://127.0.0.1:3322",
    },
  ]);
  await page.goto("/create");
  await ready(page);
  await configureCreate(page);
  await installReplacementHeightProbe(page);
  await installArrivalProbe(page);

  const action = page.locator("#generation-actions button");
  await action.click();
  await page.waitForFunction(() => {
    const text = document.querySelector(
      "#generation-content-passage .live-draft-text",
    )?.textContent;
    return text && text.length > 0 && text.length < 6;
  });
  const firstSample = await page
    .locator("#generation-content-passage .live-draft-text")
    .textContent();
  await page.waitForTimeout(70);
  const secondSample = await page
    .locator("#generation-content-passage .live-draft-text")
    .textContent();
  expect(secondSample!.length).toBeGreaterThan(firstSample!.length);

  const paragraphs = page.locator(
    "#generation-content-passage [data-paragraph-index]",
  );
  await expect(paragraphs).toHaveCount(4);
  await expect(paragraphs.nth(1)).toHaveText("They learn together.");
  await page.waitForTimeout(230);
  const arrivalEvidence = await page.evaluate(() =>
    (window.__cr312ArrivalEvidence as Array<Record<string, unknown>>).map(
      ({ node: _node, ...record }) => record,
    ),
  );
  expect(arrivalEvidence.map((record) => record.kind).sort()).toEqual([
    "draft-region",
    "plan-region",
    "word-row",
  ]);
  for (const record of arrivalEvidence) {
    expect(record).toMatchObject({
      textAtStart: expect.stringMatching(/\S/),
      classAtStart: true,
      duration: 180,
      sameNodeAfter: true,
      connectedAfter: true,
      classAfter: false,
      samples: [
        expect.objectContaining({ phase: "start" }),
        expect.objectContaining({ phase: "middle" }),
        expect.objectContaining({ phase: "after", opacity: 1 }),
      ],
    });
  }
  await paragraphs.nth(1).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -160));

  await page.evaluate(() => {
    const runtime = window as typeof window & Record<string, unknown>;
    runtime.__cr312Passage = document.querySelector(".m003-live-draft");
    runtime.__cr312Paragraph = document.querySelector(
      "[data-paragraph-index='0']",
    );
    runtime.__cr312Unchanged = document.querySelector(
      "[data-paragraph-index='1']",
    );
    runtime.__cr312Third = document.querySelector("[data-paragraph-index='2']");
    runtime.__cr312AnchorTop = document
      .querySelector("[data-paragraph-index='1']")!
      .getBoundingClientRect().top;
    const selection = getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(
      document.querySelector("[data-paragraph-index='1']")!,
    );
    selection.removeAllRanges();
    selection.addRange(range);
    document
      .querySelector<HTMLButtonElement>("#generation-actions button")!
      .focus({ preventScroll: true });
    runtime.__cr312FocusEvents = [];
    for (const type of ["focusin", "focusout"])
      document.addEventListener(type, (event) => {
        (runtime.__cr312FocusEvents as unknown[]).push({
          type,
          target: (event.target as HTMLElement | null)?.textContent?.trim(),
          related: (event as FocusEvent).relatedTarget
            ? ((event as FocusEvent).relatedTarget as HTMLElement).tagName
            : null,
          actionDisabled: document.querySelector<HTMLButtonElement>(
            "#generation-actions button",
          )?.disabled,
        });
      });
    runtime.__cr312Status = document.querySelector(".m003-stream-status");
    runtime.__cr312Action = document.querySelector(
      "#generation-actions button",
    );
  });

  const replacement = page.locator(".m003-replacement-ghost");
  await expect(replacement).toBeVisible();
  await expect(replacement).toHaveAttribute("aria-hidden", "true");
  expect(
    await replacement.evaluate((node) => (node as HTMLElement).inert),
  ).toBe(true);
  expect(
    await replacement.evaluate(
      (node) => getComputedStyle(node).animationDuration,
    ),
  ).toBe("0.22s");
  expect(
    await page.evaluate(() => {
      const runtime = window as typeof window & Record<string, unknown>;
      const unchanged = document.querySelector("[data-paragraph-index='1']")!;
      return {
        sameUnchanged: runtime.__cr312Unchanged === unchanged,
        unchangedText: unchanged.textContent,
        unchangedCue: unchanged.classList.contains("is-changed"),
        anchorDelta:
          unchanged.getBoundingClientRect().top -
          (runtime.__cr312AnchorTop as number),
        selection: getSelection()?.toString(),
      };
    }),
  ).toEqual({
    sameUnchanged: true,
    unchangedText: "They learn together.\n\n",
    unchangedCue: false,
    anchorDelta: 0,
    selection: "They learn together.\n",
  });
  await page.screenshot({ path: `${evidence}/create-repair-1440-zh.png` });
  await expect(replacement).toHaveCount(0, { timeout: 280 });
  const replacementHeightMotion = await page.evaluate(async () => {
    const runtime = window as typeof window & Record<string, unknown>;
    return await runtime.__replacementHeightPromise;
  });
  expect(replacementHeightMotion).toMatchObject({
    duration: 220,
    frames: expect.arrayContaining([expect.stringMatching(/px$/)]),
    samples: [
      expect.objectContaining({ elapsed: 0 }),
      expect.objectContaining({ elapsed: expect.any(Number) }),
      expect.objectContaining({ elapsed: expect.any(Number) }),
    ],
  });
  const animatedHeights = (
    replacementHeightMotion as { frames: string[] }
  ).frames.map(Number.parseFloat);
  expect(new Set(animatedHeights).size).toBe(2);

  const tailExitMotion = await page.evaluate(async () => {
    const runtime = window as typeof window & Record<string, unknown>;
    return await runtime.__tailExitPromise;
  });
  expect(tailExitMotion).toMatchObject({
    text: "The story stays.",
    ariaHidden: "true",
    inert: true,
    duration: expect.stringContaining("0.18s"),
    heightFrames: expect.arrayContaining([expect.stringMatching(/px$/)]),
    samples: [
      expect.objectContaining({ connected: true }),
      expect.objectContaining({ connected: true }),
      expect.objectContaining({ connected: false }),
    ],
  });
  await expect(
    page.locator("[data-paragraph-index='2'].is-changed"),
  ).toContainText("Art helps them learn.");

  await expect(page.locator(".m003-status-copy")).toHaveText("整理短文与释义");
  const plan = page.locator("#planning-preview");
  await expect(plan).toBeVisible();
  expect(await plan.evaluate((node) => getComputedStyle(node).opacity)).toBe(
    "1",
  );
  await page.evaluate(() => {
    const runtime = window as typeof window & Record<string, unknown>;
    const node = document.querySelector<HTMLElement>("#planning-preview")!;
    const started = performance.now();
    const sample = (phase: string) => ({
      phase,
      elapsed: performance.now() - started,
      connected: node.isConnected,
      className: node.className,
      opacity: node.isConnected ? Number(getComputedStyle(node).opacity) : null,
      duration: node.isConnected
        ? getComputedStyle(node).transitionDuration
        : null,
      ariaHidden: node.getAttribute("aria-hidden"),
      inert: node.inert,
      height: node.isConnected ? node.getBoundingClientRect().height : null,
    });
    runtime.__planMotionPromise = new Promise((resolve) => {
      const samples = [sample("before")];
      const observer = new MutationObserver(() => {
        if (!node.classList.contains("m003-plan-leave-active")) return;
        observer.disconnect();
        samples.push(sample("start"));
        setTimeout(() => samples.push(sample("middle")), 100);
        setTimeout(() => {
          samples.push(sample("after"));
          resolve(samples);
        }, 280);
      });
      observer.observe(node, { attributes: true, attributeFilter: ["class"] });
    });
  });
  const planMotion = await page.evaluate(async () => {
    const runtime = window as typeof window & Record<string, unknown>;
    return await (runtime.__planMotionPromise as Promise<
      Array<{
        phase: string;
        elapsed: number;
        connected: boolean;
        className: string;
        opacity: number | null;
        duration: string | null;
        ariaHidden: string | null;
        inert: boolean;
        height: number | null;
      }>
    >);
  });
  expect(planMotion[0]).toMatchObject({
    phase: "before",
    connected: true,
    opacity: 1,
    inert: false,
  });
  expect(planMotion[1]).toMatchObject({
    phase: "start",
    connected: true,
    duration: "0.24s, 0.24s",
    ariaHidden: "true",
    inert: true,
  });
  expect(planMotion[2]!.opacity!).toBeGreaterThan(0);
  expect(planMotion[2]!.opacity!).toBeLessThan(1);
  expect(planMotion[2]!.height!).toBeGreaterThan(0);
  expect(planMotion[2]!.height!).toBeLessThan(planMotion[0]!.height!);
  expect(planMotion[3]).toMatchObject({
    phase: "after",
    connected: false,
  });
  expect(
    planMotion[3]!.elapsed - planMotion[1]!.elapsed,
  ).toBeGreaterThanOrEqual(270);
  await expect(page.locator("#final-result .live-draft-text")).toContainText(
    "Friends adapt together",
  );
  await expect(page.locator(".m003-status-copy")).toHaveText("短文写好了");
  const finalIdentity = await page.evaluate(() => {
    const runtime = window as typeof window & Record<string, unknown>;
    return {
      passage:
        runtime.__cr312Passage === document.querySelector(".m003-live-draft"),
      paragraph:
        runtime.__cr312Paragraph ===
        document.querySelector("[data-paragraph-index='0']"),
      unchanged:
        runtime.__cr312Unchanged ===
        document.querySelector("[data-paragraph-index='1']"),
      third:
        runtime.__cr312Third ===
        document.querySelector("[data-paragraph-index='2']"),
      status:
        runtime.__cr312Status === document.querySelector(".m003-stream-status"),
      action:
        runtime.__cr312Action ===
        document.querySelector("#generation-actions button"),
      overflow: document.documentElement.scrollWidth <= innerWidth,
      selection: getSelection()?.toString(),
      focused:
        document.activeElement ===
        document.querySelector("#generation-actions button"),
      focusEvents: runtime.__cr312FocusEvents,
    };
  });
  console.log("CR312 focus evidence", JSON.stringify(finalIdentity));
  expect(finalIdentity).toMatchObject({
    passage: true,
    paragraph: true,
    unchanged: true,
    third: true,
    status: true,
    action: true,
    overflow: true,
    selection: "They learn together.\n",
    focused: true,
  });
  await page.screenshot({ path: `${evidence}/create-valid-1440-zh.png` });
});

test("reduced motion publishes directly and leaves no visual ghosts", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "learner",
      url: "http://127.0.0.1:3322",
    },
    {
      name: "wordweave_ui_locale",
      value: "zh-CN",
      url: "http://127.0.0.1:3322",
    },
    {
      name: "wordweave_cr312_rich",
      value: "1",
      url: "http://127.0.0.1:3322",
    },
  ]);
  await page.goto("/create");
  await ready(page);
  await configureCreate(page);
  await page.evaluate(() => {
    const runtime = window as typeof window & Record<string, unknown>;
    runtime.__cr312VisualGhosts = 0;
    runtime.__cr312EntryClasses = 0;
    new MutationObserver(() => {
      if (document.querySelector(".m003-replacement-ghost"))
        runtime.__cr312VisualGhosts = Number(runtime.__cr312VisualGhosts) + 1;
      if (document.querySelector(".is-entering"))
        runtime.__cr312EntryClasses = Number(runtime.__cr312EntryClasses) + 1;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.locator("#generation-actions button").click();
  await expect(page.locator("#final-result")).toBeVisible();
  await expect(page.locator(".m003-replacement-ghost")).toHaveCount(0);
  await expect(page.locator(".m003-paragraph-leave-active")).toHaveCount(0);
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0);
  expect(await page.evaluate(() => window.__cr312VisualGhosts)).toBe(0);
  expect(await page.evaluate(() => window.__cr312EntryClasses)).toBe(0);
});

test("cancel clears the draft and returns focus through the original action", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  let cancels = 0;
  await page.route("**/api/v1/generations/run-e2e/cancel", async (route) => {
    cancels++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { status: "cancelled", quota_refunded: false },
        meta: { request_id: "req-cr312-cancel" },
      }),
    });
  });
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "learner",
      url: "http://127.0.0.1:3322",
    },
    {
      name: "wordweave_ui_locale",
      value: "zh-CN",
      url: "http://127.0.0.1:3322",
    },
    {
      name: "wordweave_cr309_hold",
      value: "1",
      url: "http://127.0.0.1:3322",
    },
  ]);
  await page.goto("/create");
  await ready(page);
  await configureCreate(page);
  const action = page.locator("#generation-actions button");
  await action.click();
  await expect(page.locator("#generation-content-passage")).toBeVisible();
  const sameAction = await action.evaluate((node) => {
    window.__cr312CancelAction = node;
    return true;
  });
  expect(sameAction).toBe(true);
  await action.click();
  const dialog = page.locator("#generation-confirm");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: copy("zh", "confirm"), exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: copy("zh", "create.cancelled") }),
  ).toBeVisible();
  await expect(action).toBeFocused();
  expect(cancels).toBe(1);
  expect(
    await page.evaluate(() => ({
      same:
        window.__cr312CancelAction ===
        document.querySelector("#generation-actions button"),
      focused:
        document.activeElement ===
        document.querySelector("#generation-actions button"),
      staleDraft: Boolean(document.querySelector(".m003-live-draft")),
      staleGhost: Boolean(document.querySelector(".m003-replacement-ghost")),
    })),
  ).toEqual({
    same: true,
    focused: true,
    staleDraft: false,
    staleGhost: false,
  });
});

test("a hidden page catches up after the fixed typing deadline", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "learner",
      url: "http://127.0.0.1:3322",
    },
    {
      name: "wordweave_ui_locale",
      value: "zh-CN",
      url: "http://127.0.0.1:3322",
    },
    {
      name: "wordweave_cr312_rich",
      value: "1",
      url: "http://127.0.0.1:3322",
    },
  ]);
  await page.goto("/create");
  await ready(page);
  await configureCreate(page);
  await page.locator("#generation-actions button").click();
  await page.waitForFunction(() => {
    const text = document.querySelector(
      "#generation-content-passage .live-draft-text",
    )?.textContent;
    return Boolean(text && text.length > 0 && text.length < 6);
  });
  const before = await page
    .locator("#generation-content-passage .live-draft-text")
    .textContent();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
  await new Promise((resolve) => setTimeout(resolve, 900));
  await cdp.send("Page.setWebLifecycleState", { state: "active" });
  await expect(page.locator("#final-result")).toContainText(
    "Friends adapt together",
  );
  const after = await page
    .locator("#final-result .live-draft-text")
    .textContent();
  expect(after!.length).toBeGreaterThan(before!.length);
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0);
});

test("390 English PAGE212 shares live content and preserves preview readiness", async ({
  page,
  context,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await request.post(
    "http://127.0.0.1:38122/api/v1/__test/admin-presets-reset",
  );
  await request.post(
    "http://127.0.0.1:38122/api/v1/__test/admin-presets-state",
    { data: { delayed: true } },
  );
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "admin",
      url: "http://127.0.0.1:3322",
    },
    {
      name: "wordweave_ui_locale",
      value: "en-US",
      url: "http://127.0.0.1:3322",
    },
  ]);
  await page.goto("/admin/presets");
  await ready(page);
  await expect(
    page.getByRole("button", { name: copy("en", "random"), exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: copy("en", "previewgen"), exact: true })
    .click();
  await expect(page.locator("#preview-result .m003-live-draft")).toBeVisible();
  await expect(page.locator("#preview-result .m003-status-copy")).toHaveText(
    "Turning the plan into a short text",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: `${evidence}/preview-live-390-en.png` });

  await page
    .getByRole("button", { name: copy("en", "cancelgen"), exact: true })
    .click();
  await request.post(
    "http://127.0.0.1:38122/api/v1/__test/admin-presets-state",
    { data: { delayed: false } },
  );
  await page
    .getByRole("button", { name: copy("en", "previewgen"), exact: true })
    .click();
  await expect(page.locator(".preset-sample-text")).toHaveText(
    "Teams adapt quickly when the context changes.",
  );
  await expect(page.locator("#preset-actions .btn.primary")).toBeEnabled();
  await expect(page.locator(".m003-plan-preview")).toHaveCount(0);
});
