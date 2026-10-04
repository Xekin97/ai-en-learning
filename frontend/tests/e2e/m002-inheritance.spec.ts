import { test, expect, type Page } from "@playwright/test";
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
const t = (key: string, locale = "en") =>
  (source.static[locale + "." + key] ??
    source.templates[locale + "." + key]) as string;
const origin = "http://127.0.0.1:3300";
const ready = (p: Page) =>
  p.waitForFunction(() => document.documentElement.dataset.appReady === "true");
for (const locale of ["en", "zh"])
  test(
    "inherited private gates keep exact return intent through login/register: " +
      locale,
    async ({ page, context }) => {
      await context.addCookies([
        {
          name: "wordweave_ui_locale",
          value: locale === "en" ? "en-US" : "zh-CN",
          url: origin,
        },
      ]);
      for (const target of [
        "/review",
        "/library",
        "/library/batch-e2e",
        "/account",
      ]) {
        await page.goto(target);
        await ready(page);
        if (target !== "/review" && target !== "/library") {
          await expect(page.locator(".auth-gate")).toBeVisible();
          await page.locator('.auth-gate a[href^="/login"]').click();
        }
        await expect(page).toHaveURL(
          (u) =>
            u.pathname === "/login" &&
            u.searchParams.get("redirect") === target,
        );
        await ready(page);
        expect(new URL(page.url()).searchParams.get("redirect")).toBe(target);
        const username = page.locator("input[autocomplete=username]");
        await username.fill("unsent");
        await page.locator('.auth-form a[href^="/register"]').click();
        await expect(page).toHaveURL(/\/register/);
        expect(new URL(page.url()).searchParams.get("redirect")).toBe(target);
        await expect(page.locator(".auth-intent")).toBeVisible();
        await expect(page.locator(".auth-form h1")).toHaveText(
          t("i.register", locale),
        );
        await page.locator('.auth-form a[href^="/login"]').click();
        await expect(page).toHaveURL(/\/login/);
        expect(new URL(page.url()).searchParams.get("redirect")).toBe(target);
      }
    },
  );
test("incorrect login keeps return intent and permits explicit retry", async ({
  page,
}) => {
  await page.goto("/login?redirect=%2Flibrary");
  await ready(page);
  await page.locator("input[autocomplete=username]").fill("learner_e2e");
  await page.locator("input[type=password]").fill("WrongPass123!");
  await page.locator("form button[type=submit]").click();
  await expect(page.locator(".notice.error")).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveValue("");
  expect(new URL(page.url()).searchParams.get("redirect")).toBe("/library");
  await page.locator("input[type=password]").fill("CorrectPass123!");
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(origin + "/library");
});
test("date ranges preserve invalid input, never submit it, and recover through explicit retry", async ({
  page,
  context,
}) => {
  await page.route("**/api/v1/me/review-range/preview?*", (route) => {
    const q = new URL(route.request().url()).searchParams;
    const match =
      q.get("start_date")! <= "2026-08-10" &&
      q.get("end_date")! >= "2026-08-10";
    return route.fulfill({
      json: {
        data: {
          batch_count: match ? 1 : 0,
          entry_count: match ? 1 : 0,
          empty: !match,
        },
        meta: { request_id: "range-inheritance" },
      },
    });
  });
  await context.addCookies([
    { name: "wordweave_session", value: "learner", url: origin },
    { name: "cr034_case", value: "old", url: origin },
  ]);
  await page.goto("/review");
  await ready(page);
  await expect(page.locator(".range-editor")).toHaveAttribute(
    "data-range-preview",
    "empty",
  );
  const from = page.getByLabel(t("l.from"), { exact: true }),
    to = page.getByLabel(t("l.to"), { exact: true });
  const original = await from.elementHandle();
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/review-sessions")) writes++;
  });
  await from.fill("");
  await to.fill("");
  await page.locator(".range-editor form").dispatchEvent("submit");
  await expect(from).toHaveAttribute("aria-invalid", "true");
  expect(writes).toBe(0);
  await from.fill("2026-08-10");
  await to.fill("2026-08-10");
  await expect(page.locator(".range-editor")).toHaveAttribute(
    "data-range-preview",
    "ready",
  );
  expect(await from.evaluate((e, old) => e === old, original)).toBe(true);
  let fail = true;
  await page.route("**/api/v1/me/review-range/preview?*", async (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: {
            type: "about:blank",
            title: "Unavailable",
            status: 503,
            code: "temporarily_unavailable",
            detail: "Temporary failure",
            request_id: "test-range",
          },
        })
      : route.continue(),
  );
  await to.fill("2026-08-11");
  await expect(page.locator(".range-editor")).toHaveAttribute(
    "data-range-preview",
    "failed",
  );
  await expect(to).toHaveValue("2026-08-11");
  fail = false;
  await page
    .locator("#range-feedback")
    .getByRole("button", { name: t("retry"), exact: true })
    .click();
  await expect(page.locator(".range-editor")).toHaveAttribute(
    "data-range-preview",
    "ready",
  );
  await expect(from).toBeFocused();
  expect(writes).toBe(0);
});
test("account deletion keeps unchecked consent, final confirmation and clears private identity", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "wordweave_session", value: "learner", url: origin },
  ]);
  await page.goto("/account");
  await ready(page);
  await page
    .getByRole("button", { name: t("deleteaccount"), exact: true })
    .click();
  const dialog = page.locator("#delete-account");
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.locator("input[type=password]").fill("CorrectPass123!");
  let deletes = 0;
  page.on("request", (r) => {
    if (r.method() === "DELETE" && r.url().endsWith("/me/account")) {
      deletes++;
      expect(r.postDataJSON()).toEqual({
        current_password: "CorrectPass123!",
        confirmed: true,
      });
    }
  });
  await dialog.getByRole("button", { name: t("confirm"), exact: true }).click();
  expect(deletes).toBe(0);
  await expect(dialog.getByRole("checkbox")).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: t("confirm"), exact: true }).click();
  expect(deletes).toBe(0);
  await dialog
    .getByRole("button", { name: t("deleteaccount"), exact: true })
    .click();
  await expect(page).toHaveURL(origin + "/");
  expect(deletes).toBe(1);
  await page.goto("/library");
  await ready(page);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/login" &&
      url.searchParams.get("redirect") === "/library",
  );
});
test("private SSR responses remain separated and serialize no capability tokens", async ({
  browser,
}) => {
  const learner = await browser.newContext(),
    admin = await browser.newContext();
  try {
    await learner.addCookies([
      { name: "wordweave_session", value: "learner", url: origin },
    ]);
    await admin.addCookies([
      { name: "wordweave_session", value: "admin", url: origin },
    ]);
    const [a, b] = await Promise.all([
      learner.request.get(origin + "/account"),
      admin.request.get(origin + "/admin"),
    ]);
    expect(a.headers()["cache-control"]).toContain("no-store");
    expect(b.headers()["cache-control"]).toContain("no-store");
    const [ah, bh] = await Promise.all([a.text(), b.text()]);
    expect(ah).toContain("learner_e2e");
    expect(ah).not.toContain("admin_e2e");
    expect(bh).not.toContain("learner_e2e");
    for (const html of [ah, bh])
      for (const secret of [
        "csrf-e2e",
        "generation-token-e2e",
        "preview-private-token",
        "password_hash",
        "confirmation_token",
      ])
        expect(html).not.toContain(secret);
  } finally {
    await learner.close();
    await admin.close();
  }
});
