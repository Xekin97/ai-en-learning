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
  await request.post(
    "http://127.0.0.1:38080/api/v1/__test/admin-presets-reset",
  );
  await context.addCookies([
    { name: "wordweave_session", value: "admin", url: "http://127.0.0.1:3300" },
  ]);
});
test("draft, validated preview and explicit publish remain distinct", async ({
  page,
  request,
}, info) => {
  const writes: { url: string; body: Record<string, unknown> }[] = [];
  page.on("request", (r) => {
    if (
      ["POST", "PUT"].includes(r.method()) &&
      r.url().includes("/admin/presets")
    )
      writes.push({ url: r.url(), body: r.postDataJSON() });
  });
  await page.goto("/admin/presets");
  await ready(page);
  await page.getByLabel(t("preset.name"), { exact: true }).fill("New title");
  await selectValue(
    page.getByRole("combobox", { name: t("style"), exact: true }),
    "news",
  );
  await page
    .getByRole("button", { name: t("save.draft"), exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: t("publish"), exact: true }),
  ).toBeDisabled();
  let record = (
    await (
      await request.get(
        "http://127.0.0.1:38080/api/v1/admin/presets/preset-admin",
      )
    ).json()
  ).data.preset;
  expect(record.published.title).toBe("Live story");
  await page
    .getByRole("button", { name: t("previewgen"), exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: t("publish"), exact: true }),
  ).toBeEnabled();
  expect(writes.filter((w) => w.url.endsWith("/publish"))).toHaveLength(0);
  await expect(page.locator(".preset-sample-text")).toHaveText(
    "Teams adapt quickly when the context changes.",
  );
  await page.getByRole("button", { name: t("publish"), exact: true }).click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("confirm"), exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  record = (
    await (
      await request.get(
        "http://127.0.0.1:38080/api/v1/admin/presets/preset-admin",
      )
    ).json()
  ).data.preset;
  expect(record.published.title).toBe("New title");
  expect(writes.find((w) => w.url.endsWith("/previews/stream"))?.body).toEqual({
    draft_version: "draft-2",
  });
  expect(writes[0]?.body).not.toHaveProperty("description");
  await expect(page.locator("body")).not.toContainText("preview-private-token");
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-admin-presets-${info.project.name}.png`,
    fullPage: true,
  });
});
test("unavailable credential and load failure retain configurable models without quota", async ({
  page,
  request,
}) => {
  await request.post(
    "http://127.0.0.1:38080/api/v1/__test/admin-presets-state",
    { data: { missing: true } },
  );
  await page.goto("/admin/presets");
  await ready(page);
  await expect(
    page.getByRole("button", { name: t("previewgen"), exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("combobox", { name: t("model"), exact: true })
      .locator("..")
      .locator("select"),
  ).toHaveValue("model-admin");
  await expect(page.locator("main")).toContainText(t("a.key.missing"));
  await page.getByLabel(t("preset.name"), { exact: true }).fill("Kept draft");
  await request.post(
    "http://127.0.0.1:38080/api/v1/__test/admin-presets-state",
    { data: { missing: false } },
  );
  await page
    .getByRole("button", { name: t("save.draft"), exact: true })
    .click();
  await expect(page.getByLabel(t("preset.name"), { exact: true })).toHaveValue(
    "Kept draft",
  );
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole("button", { name: t("previewgen"), exact: true }),
  ).toBeEnabled();
  await expect(page.locator("main")).not.toContainText("creations left");
});
test("explicit cancellation uses preview capability without user quota commands", async ({
  page,
  request,
}) => {
  await request.post(
    "http://127.0.0.1:38080/api/v1/__test/admin-presets-state",
    { data: { delayed: true } },
  );
  let token: string | undefined;
  page.on("request", (r) => {
    if (r.url().endsWith("/preview-new/cancel"))
      token = r.headers()["x-preview-token"];
  });
  await page.goto("/admin/presets");
  await ready(page);
  await page
    .getByRole("button", { name: t("previewgen"), exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: t("cancelgen"), exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: t("cancelgen"), exact: true }).click();
  await expect(
    page.getByRole("button", { name: t("previewgen"), exact: true }),
  ).toBeEnabled();
  expect(token).toBe("preview-private-token");
  await expect(page.locator("main")).toContainText(t("create.cancelled"));
});
