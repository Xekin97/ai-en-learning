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
const t = (key: string) =>
  (source.static[`en.${key}`] ?? source.templates[`en.${key}`]) as string;
const ready = async (page: import("@playwright/test").Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
test.beforeEach(async ({ context, request }) => {
  await request.post("http://127.0.0.1:38080/api/v1/__test/review-reset");
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "learner",
      url: "http://127.0.0.1:3300",
    },
  ]);
});
async function start(page: import("@playwright/test").Page) {
  await page.goto("/library/batch-e2e");
  await ready(page);
  await page.getByRole("button", { name: t("l.single"), exact: true }).click();
  await expect(page.locator(".slot")).toHaveCount(5);
}
test("partial answers, overview editing, one-time comparison and restart", async ({
  page,
}, info) => {
  let answerRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/review-attempts/") && r.method() === "POST")
      answerRequests++;
  });
  await start(page);
  await page.locator(".slot").first().fill("x");
  await page.getByRole("button", { name: t("next"), exact: true }).click();
  await expect(page.locator(".gap")).toHaveCount(1);
  expect(answerRequests).toBe(0);
  await page.locator(".gap").fill("wrong");
  await page.getByRole("button", { name: t("next"), exact: true }).click();
  await expect(page.locator(".answer-link").first()).toHaveText("x");
  await page.locator(".answer-link").first().click();
  await expect(page.locator(".slot").first()).toHaveValue("x");
  await page.locator(".slot").first().fill("y");
  await page.getByRole("button", { name: t("next"), exact: true }).click();
  await expect(page.locator(".answer-link").first()).toHaveText("y");
  expect(answerRequests).toBe(0);
  await page.getByRole("button", { name: t("submit"), exact: true }).click();
  await expect(page.locator(".result-word .bad").first()).toHaveText("y");
  await expect(page.locator(".result-word .good")).toHaveText([
    "adapt",
    "adapt",
  ]);
  expect(answerRequests).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-review-result-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: t("restart"), exact: true }).click();
  await expect(page.locator(".slot")).toHaveCount(5);
  await expect(page.locator(".slot").first()).toHaveValue("");
  await page.getByRole("button", { name: t("overview"), exact: true }).click();
  await page.getByRole("button", { name: t("submit"), exact: true }).click();
  await expect(page.locator(".result-word .bad").first()).toHaveText(
    t("unanswered"),
  );
  await page.reload();
  await ready(page);
  await expect(page.locator(".result-word")).toHaveCount(0);
  await expect(
    page.getByText(t("l.summary.unavailable"), { exact: true }),
  ).toBeVisible();
});
test("local restoration requires confirmation and never creates a new attempt on reload", async ({
  page,
}) => {
  await start(page);
  const url = page.url();
  await page.locator(".slot").first().fill("a");
  await page.getByRole("button", { name: t("overview"), exact: true }).click();
  await page.waitForTimeout(150);
  let starts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/attempts")) starts++;
  });
  await page.reload();
  await ready(page);
  await expect(page.locator("dialog[open]")).toBeVisible();
  await expect(page.locator(".slot")).toHaveCount(0);
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("resume"), exact: true })
    .click();
  await expect(page.locator(".answer-link").first()).toHaveText("a");
  expect(starts).toBe(0);
  expect(page.url()).toBe(url);
});
test("a lost submit response reconciles the receipt without recreating comparison", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: t("overview"), exact: true }).click();
  await page.route("**/review-attempts/*/submit", async (route) => {
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: t("submit"), exact: true }).click();
  await expect(
    page.getByText(t("l.summary.unavailable"), { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".result-word")).toHaveCount(0);
});
test("two tabs cannot silently overwrite the same local draft", async ({
  page,
  context,
}) => {
  await start(page);
  await page.locator(".slot").first().fill("a");
  await page.getByRole("button", { name: t("overview"), exact: true }).click();
  await page.waitForTimeout(150);
  const second = await context.newPage();
  await second.goto(page.url());
  await ready(second);
  await expect(second.locator("dialog[open]")).toBeVisible();
  await second
    .locator("dialog[open]")
    .getByRole("button", { name: t("resume"), exact: true })
    .click();
  await second.locator(".answer-link").first().click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("resume"), exact: true })
    .click();
  await page.locator(".slot").first().fill("b");
  await expect(second.locator("dialog[open]")).toBeVisible();
  await second
    .locator("dialog[open]")
    .getByRole("button", { name: t("resume"), exact: true })
    .click();
  await expect(second.locator(".slot").first()).toHaveValue("b");
  await second.close();
});
test("over-capacity paste is rejected as a whole and existing letters remain", async ({
  page,
}) => {
  await start(page);
  await page.locator(".slot").first().fill("a");
  await page
    .locator(".slot")
    .first()
    .evaluate((el) => {
      const clipboard = new DataTransfer();
      clipboard.setData("text/plain", "toolong");
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          clipboardData: clipboard,
        }),
      );
    });
  await expect(page.locator(".slot").first()).toHaveValue("a");
  await expect(page.locator(".slot").nth(1)).toHaveValue("");
  await expect(page.locator(".review-paper [role=alert]")).toBeVisible();
});
