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
  await request.post("http://127.0.0.1:38080/api/v1/__test/admin-growth-reset");
  await context.addCookies([
    { name: "wordweave_session", value: "admin", url: "http://127.0.0.1:3300" },
  ]);
});
test("check-in settings submit five values once and preserve next-day effective state", async ({
  page,
}, info) => {
  const writes: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().endsWith("/growth/settings"))
      writes.push(r.postDataJSON());
  });
  await page.goto("/admin/growth");
  await ready(page);
  await page
    .getByRole("button", { name: t("signsettings"), exact: true })
    .click();
  await page.getByLabel(t("cap"), { exact: true }).fill("15");
  await page.getByLabel(t("firstxp"), { exact: true }).fill("3");
  await page.getByRole("button", { name: t("save"), exact: true }).click();
  await expect(page.locator("main")).toContainText("2026-09-21");
  expect(writes).toEqual([
    {
      expected_revision: "growth-config-1",
      mastery_experience: "3",
      base_points: "2",
      step_points: "1",
      cap_points: "15",
      normal_experience: "1",
    },
  ]);
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-admin-checkin-${info.project.name}.png`,
    fullPage: true,
  });
});
test("six levels save atomically and hidden edited rows remain in the submitted snapshot", async ({
  page,
}, info) => {
  const writes: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().endsWith("/growth/levels"))
      writes.push(r.postDataJSON());
  });
  await page.goto("/admin/growth");
  await ready(page);
  await page
    .getByRole("button", { name: t("levelsettings"), exact: true })
    .click();
  await page.getByLabel(t("threshold") + " 2", { exact: true }).fill("150");
  await page.getByRole("button", { name: t("addtier"), exact: true }).click();
  await page.getByLabel(t("threshold") + " 5", { exact: true }).fill("400");
  await page.getByRole("button", { name: t("addtier"), exact: true }).click();
  await page.getByLabel(t("threshold") + " 6", { exact: true }).fill("500");
  await page.getByLabel(t("a.tier.search"), { exact: true }).fill("Lv. 6");
  await page.getByRole("button", { name: t("save"), exact: true }).click();
  await expect(page.locator("dialog[open]")).toContainText(t("level.effect"));
  expect(writes).toHaveLength(0);
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("confirm"), exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(writes).toHaveLength(1);
  const changes = writes[0]?.changes as {
    id: string | null;
    client_key: string;
    value: { level_number: number };
  }[];
  expect(changes.map((c) => c.value.level_number)).toEqual([2, 5, 6]);
  expect(changes[0]?.id).toBe("level-2");
  expect(new Set(changes.map((c) => c.client_key)).size).toBe(3);
  await page.getByLabel(t("a.tier.search"), { exact: true }).fill("");
  await expect(page.locator(".tier-table tbody tr")).toHaveCount(6);
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-admin-levels-${info.project.name}.png`,
    fullPage: true,
  });
});
test("achievement content remains plain and a field error reveals its hidden row", async ({
  page,
  request,
}) => {
  let body: Record<string, unknown> | null = null;
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().endsWith("/growth/achievements"))
      body = r.postDataJSON();
  });
  await page.goto("/admin/growth");
  await ready(page);
  await page
    .getByRole("button", { name: t("achievementsettings"), exact: true })
    .click();
  await page
    .getByRole("button", { name: t("a.tier.content"), exact: true })
    .click();
  await page
    .getByLabel(t("a.tier.description.en"), { exact: true })
    .fill("<b>Literal description</b>");
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("save"), exact: true })
    .click();
  expect(body).toBeNull();
  await page
    .getByLabel(t("a.tier.search"), { exact: true })
    .fill("No matching row");
  await request.post(
    "http://127.0.0.1:38080/api/v1/__test/admin-growth-row-error",
  );
  await page.getByRole("button", { name: t("save"), exact: true }).click();
  await expect(
    page.getByLabel(t("a.tier.search"), { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel(t("threshold") + " 1", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  expect(body).toMatchObject({
    kind: "checkin_streak",
    changes: [
      {
        value: {
          description: { zh_CN: null, en_US: "<b>Literal description</b>" },
        },
      },
    ],
  });
});
test("issued cards cannot be deleted and model cards send only model-time effects", async ({
  page,
}, info) => {
  let body: Record<string, unknown> | null = null;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/growth/items"))
      body = r.postDataJSON();
  });
  await page.goto("/admin/growth");
  await ready(page);
  await page.getByRole("button", { name: t("delete"), exact: true }).click();
  await expect(page.locator("dialog[open]")).toContainText(t("delete.blocked"));
  await expect(
    page
      .locator("dialog[open]")
      .getByRole("button", { name: t("delete"), exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: t("newitem"), exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel(t("name.en"), { exact: true }).fill("Model time");
  await dialog.getByLabel(t("price"), { exact: true }).fill("20");
  await dialog.getByLabel(t("deadline"), { exact: true }).fill("30");
  await selectValue(
    dialog.getByRole("combobox", { name: t("model"), exact: true }),
    "model-admin",
  );
  await dialog.getByLabel(t("retirementpoints"), { exact: true }).fill("40");
  await dialog.getByLabel(t("duration"), { exact: true }).fill("3");
  await dialog.getByRole("button", { name: t("save"), exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(body).toMatchObject({
    kind: "model_trial",
    activation_ttl_seconds: 2592000,
    effect: {
      kind: "model_trial",
      model_ids: ["model-admin"],
      trial_seconds: 259200,
      retirement_points: "40",
    },
  });
  expect(body).not.toHaveProperty("listed");
  expect(body?.effect).not.toHaveProperty("extra_count");
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-admin-items-${info.project.name}.png`,
    fullPage: true,
  });
});
