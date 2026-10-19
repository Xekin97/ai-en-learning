import { expect, test, type Locator, type Page } from "@playwright/test";
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
  "../.planning/milestones/M002-legacy-M003/implementation/evidence/cr309-frontend";

async function ready(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}

async function vocabularyStyle(locator: Locator) {
  return locator.evaluate((element) => {
    const list = element.querySelector(".m003-vocabulary-list")!;
    const item = list.firstElementChild!;
    const term = item.querySelector("dt")!;
    const detail = item.querySelector("dd")!;
    const listStyle = getComputedStyle(list);
    const itemStyle = getComputedStyle(item);
    const termStyle = getComputedStyle(term);
    const detailStyle = getComputedStyle(detail);
    return {
      columns: listStyle.gridTemplateColumns.split(" ").length,
      columnGap: listStyle.columnGap,
      itemPaddingTop: itemStyle.paddingTop,
      itemBorderTopWidth: itemStyle.borderTopWidth,
      termFontSize: termStyle.fontSize,
      termFontWeight: termStyle.fontWeight,
      termLineHeight: termStyle.lineHeight,
      detailFontSize: detailStyle.fontSize,
      detailLineHeight: detailStyle.lineHeight,
    };
  });
}

async function configureGeneration(page: Page) {
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

test.beforeEach(async ({ context, request }, testInfo) => {
  mkdirSync(evidence, { recursive: true });
  await request.post(
    "http://127.0.0.1:38080/api/v1/__test/admin-presets-reset",
  );
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "admin",
      url: "http://127.0.0.1:3300",
    },
  ]);
  await context.clearCookies({ name: "wordweave_ui_locale" });
  testInfo.setTimeout(45_000);
});

test("CR309 keeps one meanings presentation before, during, and after preview", async ({
  page,
  request,
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  await page.setViewportSize(
    mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  );
  await page.goto("/admin/presets");
  await ready(page);

  const initialResult = page.locator(".m003-result-meanings");
  await expect(initialResult).toBeVisible();
  await expect(initialResult.locator("dt")).toHaveText("adapt");
  await expect(initialResult.locator("dd")).toHaveCount(2);
  await expect(initialResult).toContainText("English");
  await page.screenshot({
    path: `${evidence}/pre-${testInfo.project.name}.png`,
    fullPage: true,
  });

  await request.post(
    "http://127.0.0.1:38080/api/v1/__test/admin-presets-state",
    { data: { delayed: true } },
  );
  await page
    .getByRole("button", { name: copy("previewgen"), exact: true })
    .click();

  const plan = page.locator(".m003-plan-meanings");
  const retainedResult = page.locator(".m003-result-meanings");
  await expect(plan).toBeVisible();
  await expect(retainedResult).toBeVisible();
  await expect(plan.locator("[data-plan-entry=adapt]")).toHaveAttribute(
    "data-plan-kind",
    "word_use",
  );
  await expect(plan.locator("dd")).toHaveText([
    "change to fit",
    "adapt · adapt quickly",
  ]);
  await expect(retainedResult).toContainText("change to fit a new situation");
  await expect(page.locator(".m003-preview-paper .story-text")).toHaveText(
    "Teams adapt quickly when the context changes.",
  );

  const planStyle = await vocabularyStyle(plan);
  const retainedStyle = await vocabularyStyle(retainedResult);
  expect(planStyle).toEqual(retainedStyle);
  expect(planStyle).toMatchObject({
    columns: mobile ? 1 : 2,
    columnGap: "24px",
    itemPaddingTop: "10px",
    itemBorderTopWidth: "1px",
    termFontSize: "17px",
    termFontWeight: "600",
    detailFontSize: "13px",
  });
  const bodyWidth = await page
    .locator(".m003-preview-paper .m003-result-body")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(bodyWidth).toBeLessThanOrEqual(760);
  await page.screenshot({
    path: `${evidence}/during-${testInfo.project.name}.png`,
    fullPage: true,
  });

  await page
    .getByRole("button", { name: copy("cancelgen"), exact: true })
    .click();
  await request.post(
    "http://127.0.0.1:38080/api/v1/__test/admin-presets-state",
    { data: { delayed: false } },
  );
  await page
    .getByRole("button", { name: copy("previewgen"), exact: true })
    .click();
  await expect(page.locator(".preset-sample-text")).toHaveText(
    "Teams adapt quickly when the context changes.",
  );
  const finalResult = page.locator(".m003-result-meanings");
  await expect(finalResult).toBeVisible();
  await expect(page.locator(".m003-plan-meanings")).toHaveCount(0);
  expect(await vocabularyStyle(finalResult)).toEqual(retainedStyle);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${evidence}/final-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("CR309 uses the shared meanings list in the generation workspace", async ({
  page,
  context,
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  await page.setViewportSize(
    mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  );
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "learner",
      url: "http://127.0.0.1:3300",
    },
    {
      name: "wordweave_cr309_hold",
      value: "1",
      url: "http://127.0.0.1:3300",
    },
  ]);
  await page.goto("/create");
  await ready(page);
  await configureGeneration(page);
  await page.getByRole("button", { name: copy("start"), exact: true }).click();

  const plan = page.locator(".m003-plan-meanings");
  await expect(plan).toBeVisible();
  await expect(page.locator(".m003-live-draft .story-text")).toHaveText(
    "Teams adapt quickly when the context changes.",
  );
  await expect(page.locator(".m003-result-body > div").first()).not.toHaveClass(
    /article/,
  );
  const planStyle = await vocabularyStyle(plan);
  expect(planStyle.columns).toBe(mobile ? 1 : 2);
  await page.screenshot({
    path: `${evidence}/workspace-during-${testInfo.project.name}.png`,
    fullPage: true,
  });

  await context.clearCookies({ name: "wordweave_cr309_hold" });
  await page.reload();
  await ready(page);
  await configureGeneration(page);
  await page.getByRole("button", { name: copy("start"), exact: true }).click();

  const result = page.locator(".m003-final-result");
  const resultVocabulary = result.locator(".m003-result-meanings");
  await expect(result).toBeVisible();
  await expect(resultVocabulary.locator("dt")).toHaveText("adapt");
  await expect(resultVocabulary.locator("dd")).toHaveText([
    "change to fit a new situation",
    "adapt to change",
  ]);
  expect(await vocabularyStyle(resultVocabulary)).toEqual(planStyle);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${evidence}/workspace-final-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
