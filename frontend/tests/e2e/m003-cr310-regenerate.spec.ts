import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { selectValue } from "./select-control";

const copySource = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002/design/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const copy = (key: string) =>
  (copySource.static[`en.${key}`] ??
    copySource.templates[`en.${key}`]) as string;
const evidence =
  "../.planning/milestones/M002-legacy-M003/implementation/evidence/cr310-frontend";

async function ready(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}

async function configure(page: Page) {
  const settings = page.locator("details.settings");
  if (
    !(await settings.evaluate(
      (element) => (element as HTMLDetailsElement).open,
    ))
  )
    await settings.locator("summary").click();
  await selectValue(
    page.getByRole("combobox", { name: copy("model"), exact: true }),
    "model-fast",
  );
  await selectValue(
    page.getByRole("combobox", { name: copy("explain"), exact: true }),
    "en",
  );
  await page.getByRole("button", { name: copy("random"), exact: true }).click();
  await expect(page.locator(".workspace .word-token")).toContainText("adapt");
}

async function generateOldResult(page: Page) {
  await configure(page);
  await page.getByRole("button", { name: copy("start"), exact: true }).click();
  await expect(page.locator("#final-result .story-text")).toHaveText(
    "Teams adapt quickly when the context changes.",
  );
}

async function editNextInput(page: Page) {
  await selectValue(
    page.getByRole("combobox", { name: copy("style"), exact: true }),
    "discussion",
  );
  await selectValue(
    page.getByRole("combobox", { name: copy("length"), exact: true }),
    "medium",
  );
  await selectValue(
    page.getByRole("combobox", { name: copy("explain"), exact: true }),
    "zh",
  );
  await page.getByRole("button", { name: "Remove adapt", exact: true }).click();
  const search = page.getByRole("combobox", {
    name: copy("wordsearch"),
    exact: true,
  });
  await search.fill("gentle");
  await page.getByRole("option", { name: "gentle", exact: true }).click();
  await expect(page.locator(".workspace .word-token")).toContainText("gentle");
}

async function openRegenerate(page: Page) {
  const generate = page.getByRole("button", {
    name: copy("start"),
    exact: true,
  });
  await generate.click();
  const dialog = page.locator("#regenerate-confirm");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading")).toHaveText("Generate a new story?");
  await expect(dialog.locator(".dialog-body")).toHaveText(
    "Continuing will permanently discard the current unsaved story and its learning information.",
  );
  return { dialog, generate };
}

async function closeAndCheckFocus(
  page: Page,
  close: (dialog: Locator) => Promise<void>,
) {
  const { dialog, generate } = await openRegenerate(page);
  await close(dialog);
  await expect(dialog).toBeHidden();
  await expect(generate).toBeFocused();
}

function successfulDiscard(route: Route) {
  return route.fulfill({ status: 204, body: "" });
}

function sse(event: string, data: object) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function editedGenerationStream() {
  const snapshot = {
    configuration_revision: "configuration-revision-next",
    effective_plan: { code: "basic", origin: "base" },
    content_service: {
      native_validation: true,
      content_review_enabled: false,
      content_repair_limit: 0,
    },
    native_correction_policy: {
      version: "m003-native-policy-v1",
      scope: "logical_request",
      max_calls: 2,
      editable: false,
    },
  };
  return [
    sse("generation.started", {
      seq: 1,
      contract_version: "m003-stream-v6",
      stream_id: "stream-cr310-next",
      run_id: "run-cr310-next",
      generation_token: "generation-token-cr310-next",
      snapshot,
    }),
    sse("generation.progress", { seq: 2, phase: "planning" }),
    sse("generation.plan_item", {
      seq: 3,
      plan_id: "plan-cr310-next",
      meaning_language: "zh",
      item: { kind: "scene", text: "A calm discussion." },
    }),
    sse("generation.plan_item", {
      seq: 4,
      plan_id: "plan-cr310-next",
      meaning_language: "zh",
      item: {
        kind: "word_use",
        entry: "gentle",
        form: "gentle",
        sense: "温和的",
        phrase: "a gentle answer",
      },
    }),
    sse("generation.progress", { seq: 5, phase: "composing" }),
    sse("generation.draft", {
      seq: 6,
      action: "begin",
      draft_id: "draft-cr310-next",
      content_version: 1,
      mode: "initial",
      base_rev: 0,
    }),
    sse("generation.edit", {
      seq: 7,
      draft_id: "draft-cr310-next",
      content_version: 1,
      base_rev: 0,
      rev: 1,
      at: 0,
      delete_count: 0,
      insert: "A gentle answer helps.",
      source: "provider",
    }),
    sse("generation.draft", {
      seq: 8,
      action: "body_complete",
      draft_id: "draft-cr310-next",
      content_version: 1,
      base_rev: 1,
      body_length: Array.from("A gentle answer helps.").length,
      paragraph_count: 1,
    }),
    sse("generation.progress", { seq: 9, phase: "finalizing" }),
    sse("generation.validated", {
      seq: 10,
      run_id: "run-cr310-next",
      final_content_version: 1,
      result: {
        passage: "A gentle answer helps.",
        tags: ["discussion"],
        targets: [
          {
            entry: "gentle",
            entry_meaning: "温和的",
            hint_phrase: "a gentle answer",
            hint_blanks: [{ start: 2, end: 8 }],
            occurrences: [{ surface: "gentle", start: 2, end: 8 }],
          },
        ],
      },
      content_outcome: "basic",
      completion_notice: null,
    }),
  ].join("");
}

test.beforeEach(async ({ context }, testInfo) => {
  mkdirSync(evidence, { recursive: true });
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "learner",
      url: "http://127.0.0.1:3300",
    },
  ]);
  await context.clearCookies({ name: "wordweave_ui_locale" });
  testInfo.setTimeout(60_000);
});

test("CR310 retains the old result until one confirmed discard starts one snapshotted generation", async ({
  page,
}, testInfo) => {
  const generationBodies: unknown[] = [];
  const order: string[] = [];
  let discardCalls = 0;
  let releaseDiscard: (() => void) | undefined;
  const discardGate = new Promise<void>((resolve) => {
    releaseDiscard = resolve;
  });
  await page.route("**/api/v1/generations/stream", async (route) => {
    generationBodies.push(route.request().postDataJSON());
    order.push(`generate:${generationBodies.length}`);
    if (generationBodies.length === 1) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: { "cache-control": "no-store" },
      body: editedGenerationStream(),
    });
  });
  await page.route("**/api/v1/generations/run-e2e/discard", async (route) => {
    discardCalls++;
    order.push("discard:run-e2e");
    await discardGate;
    await successfulDiscard(route);
  });

  await page.goto("/create");
  await ready(page);
  await generateOldResult(page);
  const oldTitle = await page.locator("#final-result h2").textContent();
  const oldPassage = await page
    .locator("#final-result .story-text")
    .textContent();
  const oldMeanings = await page
    .locator("#final-result .m003-result-meanings")
    .textContent();

  await editNextInput(page);
  await expect(page.locator("#final-result h2")).toHaveText(oldTitle!);
  await expect(page.locator("#final-result .story-text")).toHaveText(
    oldPassage!,
  );
  await expect(page.locator("#final-result .m003-result-meanings")).toHaveText(
    oldMeanings!,
  );
  expect(discardCalls).toBe(0);
  expect(generationBodies).toHaveLength(1);

  await closeAndCheckFocus(page, async (dialog) => {
    await expect(
      dialog.getByRole("button", { name: copy("cancel"), exact: true }),
    ).toBeFocused();
    await dialog
      .getByRole("button", { name: copy("cancel"), exact: true })
      .click();
  });
  await closeAndCheckFocus(page, async () => page.keyboard.press("Escape"));
  await closeAndCheckFocus(page, async (dialog) => {
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  });
  await closeAndCheckFocus(page, async (dialog) => {
    await dialog.evaluate((element) =>
      element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
  });
  expect(discardCalls).toBe(0);
  expect(generationBodies).toHaveLength(1);
  await expect(page.locator(".workspace .word-token")).toContainText("gentle");
  await expect(page.locator("#final-result .story-text")).toHaveText(
    oldPassage!,
  );

  const { dialog } = await openRegenerate(page);
  await page.screenshot({
    path: `${evidence}/regenerate-warning-${testInfo.project.name}.png`,
  });
  const confirm = dialog.getByRole("button", {
    name: "Discard and generate",
    exact: true,
  });
  await confirm.click();
  await expect.poll(() => discardCalls).toBe(1);
  await confirm.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(
    page.getByRole("button", { name: copy("collect") }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: copy("start") }),
  ).toBeDisabled();
  expect(discardCalls).toBe(1);
  expect(generationBodies).toHaveLength(1);
  releaseDiscard!();

  await expect.poll(() => generationBodies.length).toBe(2);
  await expect(page.locator("#final-result .story-text")).toBeVisible();
  expect(order).toEqual(["generate:1", "discard:run-e2e", "generate:2"]);
  expect(generationBodies[1]).toEqual({
    model_id: "model-fast",
    meaning_language: "zh",
    scenario: "discussion",
    length: "medium",
    entries: ["gentle"],
  });
});

test("CR310 keeps result and edited inputs when discard fails", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop failure boundary");
  let generations = 0;
  let discards = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/generations/stream")) generations++;
  });
  await page.route("**/api/v1/generations/run-e2e/discard", async (route) => {
    discards++;
    await route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "about:blank",
        status: 503,
        code: "provider_unavailable",
        title: "Discard unavailable",
        detail: "Synthetic failure",
      }),
    });
  });
  await page.goto("/create");
  await ready(page);
  await generateOldResult(page);
  await editNextInput(page);
  const { dialog } = await openRegenerate(page);
  await dialog
    .getByRole("button", { name: "Discard and generate", exact: true })
    .click();
  await expect(page.locator(".m003-regenerate-error")).toHaveText(
    "The current result could not be discarded. Your story and new settings are still here; try again.",
  );
  await expect(page.locator("#final-result .story-text")).toHaveText(
    "Teams adapt quickly when the context changes.",
  );
  await expect(page.locator(".workspace .word-token")).toContainText("gentle");
  await expect(page.getByRole("button", { name: copy("start") })).toBeFocused();
  expect(discards).toBe(1);
  expect(generations).toBe(1);
});

test("CR310 owns a held leave discard against save and regenerate", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop ownership boundary");
  let releaseDiscard: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    releaseDiscard = resolve;
  });
  let generations = 0;
  let discards = 0;
  let saves = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/generations/stream")) generations++;
    if (request.url().endsWith("/generations/run-e2e/save")) saves++;
  });
  await page.route("**/api/v1/generations/run-e2e/discard", async (route) => {
    discards++;
    await gate;
    await successfulDiscard(route);
  });
  await page.goto("/create");
  await ready(page);
  await generateOldResult(page);
  await editNextInput(page);
  await page.locator('a[href="/"]').first().click();
  const leave = page.locator("#generation-confirm");
  await expect(leave).toBeVisible();
  await leave
    .getByRole("button", { name: copy("confirm"), exact: true })
    .click();
  await expect.poll(() => discards).toBe(1);
  const generate = page.getByRole("button", { name: copy("start") });
  const save = page.getByRole("button", { name: copy("collect") });
  await expect(generate).toBeDisabled();
  await expect(save).toBeDisabled();
  await generate.evaluate((button: HTMLButtonElement) => button.click());
  await save.evaluate((button: HTMLButtonElement) => button.click());
  expect(generations).toBe(1);
  expect(saves).toBe(0);
  expect(discards).toBe(1);
  releaseDiscard!();
  await expect(page).toHaveURL(/\/$/);
});

test("CR310 releases the replace lock when the next stream starts so it can be cancelled", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "desktop cancellation boundary",
  );
  let generations = 0;
  let cancels = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/generations/stream")) generations++;
  });
  await page.route("**/api/v1/generations/run-e2e/cancel", async (route) => {
    cancels++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { status: "cancelled", quota_refunded: false },
        meta: { request_id: "req-cr310-cancel" },
      }),
    });
  });
  await page.goto("/create");
  await ready(page);
  await generateOldResult(page);
  await context.addCookies([
    {
      name: "wordweave_cr309_hold",
      value: "1",
      url: "http://127.0.0.1:3300",
    },
  ]);
  const { dialog } = await openRegenerate(page);
  await dialog
    .getByRole("button", { name: "Discard and generate", exact: true })
    .click();
  const stop = page.getByRole("button", {
    name: copy("cancelgen"),
    exact: true,
  });
  await expect(stop).toBeEnabled();
  await stop.click();
  const cancelDialog = page.locator("#generation-confirm");
  await expect(cancelDialog).toBeVisible();
  await expect(
    cancelDialog.getByRole("button", { name: copy("confirm"), exact: true }),
  ).toBeEnabled();
  await cancelDialog
    .getByRole("button", { name: copy("confirm"), exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: copy("create.cancelled") }),
  ).toBeVisible();
  expect(generations).toBe(2);
  expect(cancels).toBe(1);
});

test("CR310 keeps a repeated preset generation on the published snapshot", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop preset boundary");
  const bodies: unknown[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/presets/preset-en/generations/stream"))
      bodies.push(request.postDataJSON());
  });
  await page.goto("/trial/preset-en");
  await ready(page);
  await expect(page.locator(".workspace select")).toHaveCount(0);
  await page.getByRole("button", { name: copy("start") }).click();
  await expect(page.locator("#final-result")).toBeVisible();
  await openRegenerate(page);
  await page
    .locator("#regenerate-confirm")
    .getByRole("button", { name: copy("cancel"), exact: true })
    .click();
  expect(bodies).toEqual([{ published_version: "published-1" }]);
  await expect(page.locator(".workspace select")).toHaveCount(0);
});
