import { selectValue } from "./select-control";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const source = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002/design/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const text = (key: string) =>
  (source.static[`en.${key}`] ?? source.templates[`en.${key}`]) as string;
const ready = async (page: import("@playwright/test").Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
test("ordinary workspace defaults, random selection, validated save and editable batch title", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "learner",
      url: "http://127.0.0.1:3300",
    },
  ]);
  await page.goto("/create");
  await ready(page);
  const settings = page.locator("details.settings");
  if (!(await settings.evaluate((el) => (el as HTMLDetailsElement).open)))
    await settings.locator("summary").click();
  await expect(
    page
      .getByRole("combobox", { name: text("style"), exact: true })
      .locator("..")
      .locator("select"),
  ).toHaveValue("story");
  await expect(
    page
      .getByRole("combobox", { name: text("length"), exact: true })
      .locator("..")
      .locator("select"),
  ).toHaveValue("short");
  await expect(
    page
      .getByRole("combobox", { name: text("model"), exact: true })
      .locator("..")
      .locator("select"),
  ).toHaveValue("");
  await expect(
    page
      .getByRole("combobox", { name: text("explain"), exact: true })
      .locator("..")
      .locator("select"),
  ).toHaveValue("");
  await selectValue(
    page.getByRole("combobox", { name: text("model"), exact: true }),
    "model-fast",
  );
  await selectValue(
    page.getByRole("combobox", { name: text("explain"), exact: true }),
    "en",
  );
  await page.getByRole("button", { name: text("random"), exact: true }).click();
  await expect(page.locator(".workspace .word-token")).toContainText("adapt");
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-create-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: text("start"), exact: true }).click();
  await expect(
    page.locator("[data-region=generation-result] .story-text"),
  ).toHaveText("Teams adapt quickly when the context changes.");
  await page
    .getByRole("button", { name: text("collect"), exact: true })
    .click();
  await expect(page).toHaveURL(/\/library\/batch-e2e/);
  await page
    .getByRole("button", { name: text("l.title.edit"), exact: true })
    .click();
  await page
    .getByLabel(text("l.title.label"), { exact: true })
    .fill("A changed title");
  await page
    .getByRole("button", { name: text("l.title.save"), exact: true })
    .click();
  await expect(page.locator("#saved-batch-title")).toHaveText(
    "A changed title",
  );
  await expect(page.locator(".batch-settings .trial-model")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-batch-${info.project.name}.png`,
    fullPage: true,
  });
});
test("gallery loads all cursors before counts, filters language and enters a locked manual-start workspace", async ({
  page,
}, info) => {
  let generations = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/generations/stream")) generations++;
  });
  await page.goto("/explore");
  await ready(page);
  await expect(page.locator(".gallery-card")).toHaveCount(2);
  await expect(page.locator(".gallery-tab-count").first()).toHaveText("2");
  await page.getByRole("tab", { name: /English/ }).click();
  await expect(page.locator(".gallery-card")).toHaveCount(1);
  await expect(page.locator(".gallery-passage")).toContainText(
    "Teams adapt quickly when the context changes.",
  );
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-explore-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: text("try"), exact: true }).click();
  await expect(page).toHaveURL(/\/trial\/preset-en/);
  await expect(page.locator(".trial-config-facts")).toBeVisible();
  await expect(page.locator(".workspace select")).toHaveCount(0);
  expect(generations).toBe(0);
  await page.getByRole("button", { name: text("start"), exact: true }).click();
  await expect(
    page.locator("[data-region=generation-result] .story-text"),
  ).toBeVisible();
  expect(generations).toBe(1);
  await page
    .getByRole("button", { name: text("guestcollect"), exact: true })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await ready(page);
  await page
    .getByLabel(text("i.username"), { exact: true })
    .fill("learner_e2e");
  await page
    .getByLabel(text("i.password"), { exact: true })
    .fill("CorrectPass123!");
  await page.locator(".auth-form button[type=submit]").click();
  await expect(page).toHaveURL(/\/library\/batch-e2e/);
  expect(generations).toBe(1);
});
