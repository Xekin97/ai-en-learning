import { expect, test, type Page } from "@playwright/test";
import { selectValue } from "./select-control";

const adminUsername = process.env.M003_ADMIN_USERNAME;
const adminPassword = process.env.M003_ADMIN_PASSWORD;
const proUsername = process.env.M003_PRO_USERNAME;
const proPassword = process.env.M003_PRO_PASSWORD;
const q02Model = process.env.M003_Q02_MODEL;
const q02Title = process.env.M003_Q02_TITLE ?? "M003 Q02 browser sample";

async function ready(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await ready(page);
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("published Q02 notice remains visible and plan impact keeps N semantics", async ({
  page,
}) => {
  test.skip(
    !adminUsername || !adminPassword,
    "isolated-stack credentials required",
  );
  await login(page, adminUsername!, adminPassword!);

  await page.goto("/admin/presets");
  await ready(page);
  await page.locator(".admin-record", { hasText: q02Title }).click();
  await expect(page.getByTestId("preset-q02-notice")).toBeVisible();
  await expect(page.locator(".usage-note")).toContainText("Unknown");
  await page.screenshot({
    path: "../tmp/browser-evidence/M002-legacy-M003/frontend-tech03/admin-q02-final.png",
    fullPage: true,
  });

  await page.goto("/admin/plans");
  await ready(page);
  await page.getByRole("button", { name: "Pro", exact: true }).click();
  const limit = page.locator("#content-repair-limit");
  const enabled = page.locator("#content-review-enabled");
  await limit.fill("2");
  await expect(enabled).toBeChecked();
  await enabled.uncheck();
  await expect(limit).toHaveValue("0");
  await enabled.check();
  await expect(limit).toHaveValue("2");
  await limit.fill("0");
  await expect(enabled).not.toBeChecked();
  await limit.fill("99");
  await page
    .locator("form.panel")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  const dialog = page.locator("#plan-impact[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("99");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../tmp/browser-evidence/M002-legacy-M003/frontend-tech03/admin-plans-mobile.png",
    fullPage: true,
  });
});

test("enhanced Q02 result remains savable without exposing internal review counts", async ({
  page,
}) => {
  test.skip(
    !proUsername || !proPassword || !q02Model,
    "isolated-stack credentials and Q02 model required",
  );
  await login(page, proUsername!, proPassword!);
  await page.goto("/create");
  await ready(page);

  const settings = page.locator("details.settings");
  if (!(await settings.evaluate((node) => (node as HTMLDetailsElement).open)))
    await settings.locator("summary").click();
  await selectValue(page.getByRole("combobox", { name: "Model" }), q02Model!);
  await selectValue(page.getByRole("combobox", { name: "Style" }), "story");
  await selectValue(page.getByRole("combobox", { name: "Length" }), "short");
  await selectValue(
    page.getByRole("combobox", { name: "Explanation language" }),
    "en",
  );
  const search = page.locator("#create-words-search");
  await search.fill("grape");
  await page.getByRole("option", { name: "grape", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate story", exact: true })
    .click();

  const result = page.locator(".m003-final-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText(
    "Content review is incomplete. This complete valid story can still be saved.",
  );
  await expect(result).not.toContainText(
    /\b(?:review|repair)\s+\d+\s*\/\s*\d+/i,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../tmp/browser-evidence/M002-legacy-M003/frontend-tech03/pro-q02-mobile.png",
    fullPage: true,
  });
  await result
    .getByRole("button", { name: "Save and review", exact: true })
    .click();
  await expect(page).toHaveURL(/\/library\//, { timeout: 15_000 });
  await expect(page.locator(".story-text")).toBeVisible();
});

test("Pro N0 and Plus N99 persist independently without starting generation", async ({
  page,
}) => {
  test.skip(
    !adminUsername || !adminPassword,
    "isolated-stack credentials required",
  );
  let generationPosts = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/(?:generations|preview-runs)(?:\/|$)/.test(
        new URL(request.url()).pathname,
      )
    )
      generationPosts++;
  });
  await login(page, adminUsername!, adminPassword!);
  await page.goto("/admin/plans");
  await ready(page);

  async function saveLimit(plan: "Pro" | "Plus", limit: string) {
    await page.getByRole("button", { name: plan, exact: true }).click();
    await page.locator("#content-repair-limit").fill(limit);
    await page
      .locator("form.panel")
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    const dialog = page.locator("#plan-impact[open]");
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  }

  await saveLimit("Pro", "0");
  await saveLimit("Plus", "99");
  await page.reload();
  await ready(page);
  await page.getByRole("button", { name: "Pro", exact: true }).click();
  await expect(page.locator("#content-repair-limit")).toHaveValue("0");
  await expect(page.locator("#content-review-enabled")).not.toBeChecked();
  await page.getByRole("button", { name: "Plus", exact: true }).click();
  await expect(page.locator("#content-repair-limit")).toHaveValue("99");
  await expect(page.locator("#content-review-enabled")).toBeChecked();
  expect(generationPosts).toBe(0);
});

test("published preset trial consumes the v5 stream and completes at 768px", async ({
  page,
}) => {
  let generationPosts = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/generations/stream")
    )
      generationPosts++;
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/explore");
  await ready(page);
  const card = page.locator(".gallery-card", { hasText: q02Title });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Try this", exact: true }).click();
  await expect(page).toHaveURL(/\/trial\//);
  await ready(page);
  await page
    .getByRole("button", { name: "Generate story", exact: true })
    .click();
  await expect(page.locator(".m003-final-result")).toBeVisible({
    timeout: 30_000,
  });
  expect(generationPosts).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../tmp/browser-evidence/M002-legacy-M003/frontend-tech03/trial-v5-768.png",
    fullPage: true,
  });
});
