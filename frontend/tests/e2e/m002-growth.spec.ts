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
  await request.post("http://127.0.0.1:38080/api/v1/__test/growth-reset");
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "learner",
      url: "http://127.0.0.1:3300",
    },
  ]);
});
test("growth preserves large amounts and literal descriptions, rewards require a click", async ({
  page,
}, info) => {
  const claims: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/claim"))
      claims.push(r.headers()["idempotency-key"] ?? "");
  });
  await page.goto("/account/growth");
  await ready(page);
  await expect(page.locator(".growth-banner")).toContainText(
    "9007199254740993",
  );
  await expect(page.locator(".achievement-description")).toHaveText(
    "<b>Plain text description</b>",
  );
  await expect(page.locator(".achievement-description b")).toHaveCount(0);
  expect(claims).toHaveLength(0);
  await expect(page.locator(".level-reward button")).toBeDisabled();
  await page.getByRole("button", { name: t("claim"), exact: true }).click();
  await expect(page.locator(".achievement button")).toHaveText(t("claimed"));
  expect(claims).toHaveLength(1);
  expect(claims[0]).toMatch(/^[a-f0-9-]{36}$/);
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-growth-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("plan activation requires confirmation and stale retirement price requires another preview", async ({
  page,
  request,
}, info) => {
  let activates = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/activate")) activates++;
  });
  await page.goto("/account/items");
  await ready(page);
  await page.locator(".item-plan").getByRole("button").click();
  await expect(page.locator("dialog[open]")).toContainText(t("b.cover"));
  expect(activates).toBe(0);
  expect(
    await page.evaluate(
      () => document.querySelector("script[data-nuxt-data]")?.textContent ?? "",
    ),
  ).not.toContain("activation-private");
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("confirm"), exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(activates).toBe(1);
  await page.locator(".item-model").getByRole("button").click();
  await expect(page.locator("dialog[open]")).toContainText("20");
  await request.post(
    "http://127.0.0.1:38080/api/v1/__test/refund-price-change",
  );
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("confirm"), exact: true })
    .click();
  await expect(
    page
      .locator("dialog[open]")
      .getByRole("button", { name: t("retry"), exact: true }),
  ).toBeVisible();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("retry"), exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toContainText("40");
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("confirm"), exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".item-model button")).toBeDisabled();
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-items-${info.project.name}.png`,
    fullPage: true,
  });
});
