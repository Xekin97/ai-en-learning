import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const copySource = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002-legacy-M003/design/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const api = `${process.env.CR307_MOCK_ORIGIN ?? "http://127.0.0.1:38107"}/api/v1`;
const ready = (page: Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );

test.beforeEach(async ({ request, context, baseURL }, info) => {
  await request.post(api + "/__test/admin-reset");
  await context.addCookies([
    { name: "wordweave_session", value: "admin", url: baseURL! },
    {
      name: "wordweave_ui_locale",
      value: info.project.name === "mobile" ? "en-US" : "zh-CN",
      url: baseURL!,
    },
  ]);
});

test("CR307 traps the top dialog and restores the stable provider opener", async ({
  page,
}, info) => {
  const lang = info.project.name === "mobile" ? "en" : "zh";
  const t = (key: string) => copySource.static[`${lang}.${key}`] as string;
  let probes = 0;
  page.on("request", (request) => {
    if (request.url().includes("/admin/model-connection-test")) probes++;
  });

  await page.goto("/admin/models");
  await ready(page);
  const opener = page.locator("[data-provider-edit]").first();
  await opener.click();
  const dialog = page.locator("#admin-model"),
    close = dialog.locator(".dialog-close"),
    footerCancel = dialog
      .locator(".dialog-actions")
      .getByRole("button", { name: t("cancel"), exact: true }),
    save = dialog.getByRole("button", { name: t("gm.save"), exact: true });
  await expect(dialog).toBeVisible();

  await save.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(save).toBeFocused();
  for (const key of [
    ...Array<string>(32).fill("Tab"),
    ...Array<string>(32).fill("Shift+Tab"),
  ]) {
    await page.keyboard.press(key);
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }

  await dialog.locator('[name="connectionName"]').fill("CR307 provider");
  await footerCancel.click();
  const confirm = page.locator("#model-discard"),
    keep = confirm.getByRole("button", { name: t("gm.keep"), exact: true }),
    discard = confirm.getByRole("button", {
      name: t("gm.discard"),
      exact: true,
    });
  await expect(confirm).toBeVisible();
  await discard.focus();
  await page.keyboard.press("Tab");
  await expect(confirm.locator(".dialog-close")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(discard).toBeFocused();
  expect(
    await confirm.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(false);
  await keep.click();
  await expect(confirm).not.toBeVisible();
  await expect(footerCancel).toBeFocused();

  await footerCancel.click();
  await expect(confirm).toBeVisible();
  await discard.click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog).toBeVisible();
  await dialog.locator('[name="connectionName"]').fill("CR307 provider");

  const staleOpener = await opener.elementHandle();
  await opener.evaluate((button) => {
    const replacement = button.cloneNode(true);
    button.replaceWith(replacement);
  });
  expect(await staleOpener!.evaluate((button) => button.isConnected)).toBe(
    false,
  );

  await save.click();
  await expect(dialog).not.toBeVisible();
  const currentOpener = page.locator("[data-provider-edit]").first();
  await expect(currentOpener).toBeFocused();
  await expect(
    page.locator(".generic-provider-card").first().getByRole("heading", {
      name: "CR307 provider",
    }),
  ).toBeVisible();
  expect(probes).toBe(0);
  await page.screenshot({
    path: `../tmp/browser-evidence/M002-legacy-M003/cr307-frontend-fix/${info.project.name}-focus-return.png`,
    fullPage: true,
  });
});
