import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

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
const ready = (page: import("@playwright/test").Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
const encryptedFile = {
  name: "synthetic-models.wwcfg.json",
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify({
      format: "wordweave-config-encrypted",
      version: 1,
      category: "models",
      credential_mode: "encrypted",
      kdf: {},
      cipher: {},
      ciphertext: "synthetic",
    }),
  ),
};

test.beforeEach(async ({ context, request }) => {
  await request.post("http://127.0.0.1:43131/api/v1/__test/admin-reset");
  await request.post("http://127.0.0.1:43131/api/v1/__test/portability-reset");
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "admin",
      url: "http://127.0.0.1:43130",
    },
    {
      name: "wordweave_ui_locale",
      value: "en-US",
      url: "http://127.0.0.1:43130",
    },
  ]);
});

test("encrypted model import uses a modal, dynamic contract values and one terminal import", async ({
  page,
}, info) => {
  await page.goto("/admin/models");
  await ready(page);
  await page
    .getByRole("button", { name: t("portability.import"), exact: true })
    .click();
  const dialog = page.locator("#cr313-dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((node) =>
      (node as HTMLDialogElement).matches(":modal"),
    ),
  ).toBe(true);
  await dialog.locator('input[type="file"]').setInputFiles(encryptedFile);
  await expect(dialog).toContainText("synthetic-models.wwcfg.json");
  await expect(dialog).toContainText("Encrypted package");
  await dialog.locator('input[type="password"]').fill("synthetic password");
  await dialog
    .getByRole("button", { name: t("import.validate"), exact: true })
    .click();
  await expect(dialog).toContainText("Synthetic connection");
  await expect(dialog).toContainText(
    "Encrypted credentials from this file are present for all 1 connections",
  );
  await expect(dialog).toContainText(t("notice.nameGenerated"));
  await expect(dialog).toContainText(t("notice.effectivePlanMayChange"));
  await dialog
    .getByRole("button", { name: t("preview.confirm"), exact: true })
    .click();
  await expect(dialog.getByText("Legacy model", { exact: true })).toBeVisible();
  await expect(
    dialog.getByLabel(t("confirm.ack"), { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel(t("confirm.ack"), { exact: true }).check();
  await dialog
    .getByRole("button", { name: t("confirm.replace"), exact: true })
    .click();
  await expect(dialog).toContainText(t("result.successHelp"));
  const state = await (
    await page.request.get(
      "http://127.0.0.1:43131/api/v1/__test/portability-state",
    )
  ).json();
  expect(state.data.import_calls).toBe(1);
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/config-portability/evidence/frontend/models-success-${info.project.name}.png`,
    fullPage: true,
  });
});

test("unknown result survives refresh and resolve never replays imports", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:43131/api/v1/__test/portability-mode", {
    data: { mode: "unknown" },
  });
  await page.goto("/admin/models");
  await ready(page);
  await page
    .getByRole("button", { name: t("portability.import"), exact: true })
    .click();
  const dialog = page.locator("#cr313-dialog");
  await dialog.locator('input[type="file"]').setInputFiles(encryptedFile);
  await dialog.locator('input[type="password"]').fill("synthetic password");
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
  await expect(dialog).toContainText(t("result.unknownHelp"));
  await page.reload();
  await ready(page);
  await expect(page.locator("#cr313-dialog")).toContainText(
    t("result.unknownHelp"),
  );
  await page
    .locator("#cr313-dialog")
    .getByRole("button", { name: t("result.check"), exact: true })
    .click();
  await expect(page.locator("#cr313-dialog")).toContainText(
    t("result.successHelp"),
  );
  const state = await (
    await request.get("http://127.0.0.1:43131/api/v1/__test/portability-state")
  ).json();
  expect(state.data.import_calls).toBe(1);
});

test("dependency-blocked preview exposes safe context and cannot dispatch an import", async ({
  page,
  request,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "One bounded desktop blocker case is sufficient for FE-V4",
  );
  await request.post("http://127.0.0.1:43131/api/v1/__test/portability-mode", {
    data: { mode: "blocked" },
  });
  await page.goto("/admin/models");
  await ready(page);
  await page
    .getByRole("button", { name: t("portability.import"), exact: true })
    .click();
  const dialog = page.locator("#cr313-dialog");
  await dialog.locator('input[type="file"]').setInputFiles(encryptedFile);
  await dialog.locator('input[type="password"]').fill("synthetic password");
  await dialog
    .getByRole("button", { name: t("import.validate"), exact: true })
    .click();
  await expect(dialog).toContainText(t("error.dependencyHelp"));
  await expect(dialog).toContainText(
    "Basic plan references “Legacy model”, which would be removed",
  );
  await expect(
    dialog.getByRole("button", { name: t("preview.confirm"), exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: t("confirm.replace"), exact: true }),
  ).toHaveCount(0);
  const state = await (
    await request.get("http://127.0.0.1:43131/api/v1/__test/portability-state")
  ).json();
  expect(state.data.import_calls).toBe(0);
  await page.screenshot({
    path: "../.planning/milestones/M002/implementation/config-portability/evidence/frontend/models-blocked-desktop-en.png",
    fullPage: true,
  });
});

test("four approved entries remain category-specific and priority editing stays top-layer", async ({
  page,
}, info) => {
  await page.goto("/admin/plans");
  await ready(page);
  await expect(
    page.getByRole("button", { name: t("portability.import"), exact: true }),
  ).toHaveCount(1);
  const priority = page.getByRole("button", {
    name: "Tier priority",
    exact: true,
  });
  await priority.click();
  const priorityDialog = page.locator("#priority-editor");
  expect(
    await priorityDialog.evaluate((node) =>
      (node as HTMLDialogElement).matches(":modal"),
    ),
  ).toBe(true);
  const inputs = priorityDialog.locator('input[type="number"]');
  await inputs.nth(0).fill("37");
  await inputs.nth(1).fill("41");
  await priorityDialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(inputs.nth(0)).toHaveValue("37");
  await expect(inputs.nth(1)).toHaveValue("41");
  await page.mouse.click(2, 2);
  await expect(priorityDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(priorityDialog).toBeHidden();
  await expect(priority).toBeFocused();

  await page.goto("/admin/growth");
  await ready(page);
  await page
    .getByRole("button", { name: t("portability.import"), exact: true })
    .click();
  await expect(page.locator("#cr313-dialog")).toContainText(
    t("import.titleItems"),
  );
  await page
    .locator("#cr313-dialog")
    .getByRole("button", { name: t("common.cancel"), exact: true })
    .click();
  await page
    .getByRole("button", { name: "Check-in rules", exact: true })
    .click();
  await page
    .getByRole("button", { name: t("portability.import"), exact: true })
    .click();
  await expect(page.locator("#cr313-dialog")).toContainText(
    t("import.titleGrowth"),
  );
  if (info.project.name === "mobile")
    await page.screenshot({
      path: "../.planning/milestones/M002/implementation/config-portability/evidence/frontend/growth-entry-mobile-en.png",
      fullPage: true,
    });
});
