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
const t = (key: string) =>
  (source.static[`en.${key}`] ?? source.templates[`en.${key}`]) as string;
const ready = async (page: import("@playwright/test").Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
test.beforeEach(async ({ context, request }) => {
  await request.post("http://127.0.0.1:38080/api/v1/__test/admin-reset");
  await context.addCookies([
    { name: "wordweave_session", value: "admin", url: "http://127.0.0.1:3300" },
  ]);
});
test("model removal previews impacts, sends the bound revision and confirmation once", async ({
  page,
}, info) => {
  let deletion: Record<string, unknown> | null = null;
  page.on("request", (r) => {
    if (r.method() === "DELETE") deletion = r.postDataJSON();
  });
  await page.goto("/admin/models");
  await ready(page);
  await expect(page.locator(".generic-model-list")).toContainText("Admin model");
  await page.getByRole("button", { name: t("a.remove"), exact: true }).click();
  await expect(page.locator("dialog[open]")).toContainText(t("a.model.last"));
  expect(deletion).toBeNull();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("a.remove"), exact: true })
    .click();
  await expect(page.locator(".generic-model-row")).toHaveCount(0);
  expect(deletion).toEqual({
    expected_revision: "admin-revision-1",
    confirmation_token: "remove-private",
    confirmed: true,
  });
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-admin-models-${info.project.name}.png`,
    fullPage: true,
  });
});
test("plan conflict keeps edits and priorities exchange as a single command", async ({
  page,
  request,
}, info) => {
  await page.goto("/admin/plans");
  await ready(page);
  await page.getByLabel(t("words.limit"), { exact: true }).fill("17");
  await request.post("http://127.0.0.1:38080/api/v1/__test/admin-conflict");
  await page
    .locator("form.panel")
    .getByRole("button", { name: t("a.save"), exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel(t("words.limit"), { exact: true })).toHaveValue(
    "17",
  );
  await page
    .locator("form.panel")
    .getByRole("button", { name: t("a.save"), exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("a.save"), exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("button", { name: t("priority"), exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel(t("a.plan.basic"), { exact: true }).fill("20");
  await dialog.getByLabel(t("a.plan.pro"), { exact: true }).fill("10");
  await dialog.getByRole("button", { name: t("a.save"), exact: true }).click();
  await dialog.getByRole("button", { name: t("confirm"), exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: t("a.plan.basic"), exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: t("priority"), exact: true }),
  ).toHaveValue("20");
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-admin-plans-${info.project.name}.png`,
    fullPage: true,
  });
});
test("blank user search, read-only titled story, positive grant and base-only reset remain available", async ({
  page,
  request,
}, info) => {
  await page.goto("/admin/users");
  await ready(page);
  await page.getByRole("button", { name: t("a.search"), exact: true }).click();
  await expect(page.locator(".generic-model-row")).toHaveCount(2);
  await page
    .locator("tbody tr")
    .filter({ hasText: "learner_target" })
    .getByRole("link")
    .click();
  await page
    .getByRole("button", { name: t("a.user.learning"), exact: true })
    .click();
  await expect(page.locator(".admin-library-row h3")).toHaveText(
    "My edited story",
  );
  await page.getByRole("button", { name: t("a.reader"), exact: true }).click();
  await expect(page.locator("dialog[open] .story-text")).toHaveText(
    "Teams adapt.",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page
    .getByRole("button", { name: t("a.user.points"), exact: true })
    .click();
  await page.getByLabel(t("amount"), { exact: true }).fill("7");
  await page.getByLabel(t("reason"), { exact: true }).fill("Correction");
  await page
    .getByRole("button", { name: t("a.supplement"), exact: true })
    .click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("confirm"), exact: true })
    .click();
  await expect(page.locator(".generic-model-list")).toContainText("47");
  await page
    .getByRole("button", { name: t("a.user.identity"), exact: true })
    .click();
  await page
    .getByRole("button", { name: t("a.user.plan"), exact: true })
    .click();
  await selectValue(page.locator("dialog[open] select"), "pro");
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("confirm"), exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const state = await (
    await request.get(
      "http://127.0.0.1:38080/api/v1/admin/users/learner-target/benefits",
    )
  ).json();
  expect(state.data.base_plan.code).toBe("pro");
  expect(state.data.trial.quota.remaining).toBe(2);
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-admin-user-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("direct user points URL opens the configured points view", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (/hydration.*mismatch/i.test(m.text())) errors.push(m.text());
  });
  await page.goto("/admin/users/user-target#points");
  await ready(page);
  await expect(
    page.getByRole("button", { name: t("a.user.points"), exact: true }),
  ).toHaveClass(/selected/);
  await expect(
    page.getByRole("button", { name: t("a.supplement"), exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
