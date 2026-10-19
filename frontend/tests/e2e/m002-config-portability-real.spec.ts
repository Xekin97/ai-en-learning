import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const username = process.env.CR313_REAL_ADMIN_USERNAME;
const password = process.env.CR313_REAL_ADMIN_PASSWORD;
const packagePath = process.env.CR313_REAL_PACKAGE_PATH;
const passphrase = process.env.CR313_REAL_PACKAGE_PASSPHRASE;
const approved = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002/design/config-portability/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const alignment = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002/design/config-portability/technical-alignment/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const messages = {
  ...approved.static,
  ...approved.templates,
  ...alignment.static,
  ...alignment.templates,
};
const t = (key: string) => messages[`en.${key}`] as string;

test("real API normal export, preview, import, current and resolve use the production chain", async ({
  page,
}) => {
  test.skip(
    !username || !password || !packagePath || !passphrase,
    "isolated real fixture variables are required",
  );
  await page.goto("/login");
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
  await page.locator('input[name="username"]').fill(username!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/models");
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );

  await page
    .getByRole("button", { name: t("portability.export"), exact: true })
    .click();
  const dialog = page.locator("#cr313-dialog");
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: t("export.prepare"), exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(
    /^wordweave-models-\d{8}T\d{6}Z\.json$/,
  );
  await dialog
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();

  await page
    .getByRole("button", { name: t("portability.import"), exact: true })
    .click();
  await dialog.locator('input[type="file"]').setInputFiles(packagePath!);
  await dialog.locator('input[type="password"]').fill(passphrase!);
  await dialog
    .getByRole("button", { name: t("import.validate"), exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: t("preview.confirm"), exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: t("preview.confirm"), exact: true })
    .click();
  await dialog.getByLabel(t("confirm.ack"), { exact: true }).check();

  let importCalls = 0;
  let totalImports = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/config-portability/models/imports"))
      totalImports++;
  });
  await page.route(
    "**/api/v1/admin/config-portability/models/imports",
    async (route) => {
      importCalls++;
      await route.fetch();
      await route.abort("failed");
    },
  );
  await dialog
    .getByRole("button", { name: t("confirm.replace"), exact: true })
    .click();
  await expect(dialog).toContainText(t("result.unknownHelp"));
  expect(importCalls).toBe(1);

  await dialog
    .getByRole("button", { name: t("result.read"), exact: true })
    .click();
  await expect(dialog).toContainText(t("result.current"));
  expect(importCalls).toBe(1);
  await dialog
    .getByRole("button", { name: t("result.check"), exact: true })
    .click();
  await expect
    .poll(async () => {
      const text = await dialog.innerText();
      return (
        text.includes(t("result.successHelp")) ||
        text.includes(t("result.notAppliedHelp"))
      );
    })
    .toBe(true);
  expect(importCalls).toBe(1);

  await dialog
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await page.unroute("**/api/v1/admin/config-portability/models/imports");
  await page
    .getByRole("button", { name: t("portability.import"), exact: true })
    .click();
  await dialog.locator('input[type="file"]').setInputFiles(packagePath!);
  await dialog.locator('input[type="password"]').fill(passphrase!);
  await dialog
    .getByRole("button", { name: t("import.validate"), exact: true })
    .click();
  await dialog
    .getByRole("button", { name: t("preview.confirm"), exact: true })
    .click();
  await dialog.getByLabel(t("confirm.ack"), { exact: true }).check();
  await dialog
    .getByRole("button", { name: t("confirm.replace"), exact: true })
    .click();
  await expect(dialog).toContainText(t("result.successHelp"));
  expect(totalImports).toBe(2);
});
