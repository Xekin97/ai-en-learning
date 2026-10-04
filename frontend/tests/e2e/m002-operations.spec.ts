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
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:38080/api/v1/__test/operations-reset");
});
test("analytics distinguishes zero, missing, observing, and unavailable without loading Clarity", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "wordweave_session", value: "admin", url: "http://127.0.0.1:3300" },
  ]);
  const external: string[] = [];
  page.on("request", (r) => {
    if (/clarity\.(ms|microsoft\.com)/.test(r.url())) external.push(r.url());
  });
  await page.goto("/admin/analytics");
  await ready(page);
  await expect(page.locator(".metrics-grid")).toContainText(t("unknown"));
  await expect(page.locator(".metrics-grid")).toContainText("0.0%");
  await expect(page.locator(".notice.warn")).toHaveText(t("delayed"));
  await expect(page.locator(".split")).toContainText(t("nosample"));
  await expect(page.locator(".split")).toContainText(t("observing"));
  expect(external).toEqual([]);
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-admin-analytics-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("message editor preserves empty translation slots and uses safe server preview", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "wordweave_session", value: "admin", url: "http://127.0.0.1:3300" },
  ]);
  let saved: Record<string, unknown> | null = null;
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/admin/notices/"))
      saved = r.postDataJSON();
  });
  await page.goto("/admin/notices");
  await ready(page);
  await expect(page.getByLabel(t("name.en"), { exact: true })).toHaveValue("");
  await expect(page.getByLabel(t("name.zh"), { exact: true })).toHaveValue(
    "中文通知",
  );
  await page
    .getByLabel(t("name.en"), { exact: true })
    .fill("English title only");
  await page.getByRole("button", { name: t("preview"), exact: true }).click();
  await expect(page.locator("dialog[open] .notice-body strong")).toHaveText(
    "Safe preview",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: t("save"), exact: true }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect(saved).toMatchObject({
    title: { zh_CN: "中文通知", en_US: "English title only" },
    body_markdown: { zh_CN: "**正文**", en_US: null },
    expected_revision: "notice-1",
  });
  await page.screenshot({
    path: `../.planning/milestones/M002/implementation/evidence/frontend-ui26/regression-admin-notices-${info.project.name}.png`,
    fullPage: true,
  });
});
test("first-party page views exclude URL, private inputs and locale redraws", async ({
  page,
}) => {
  const events: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/analytics/events") && r.method() === "POST")
      events.push(r.postDataJSON());
  });
  await page.goto(
    "/?utm_source=example&username=private-value&token=secret-value",
  );
  await ready(page);
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toMatchObject({
    kind: "page_view",
    page: "PAGE-205",
    source: { utm_source: "example" },
  });
  expect(JSON.stringify(events)).not.toContain("private-value");
  expect(JSON.stringify(events)).not.toContain("secret-value");
  await selectValue(
    page.getByRole("combobox", { name: t("language"), exact: true }),
    "zh-CN",
  );
  await page.getByRole("link", { name: "精选", exact: true }).click();
  await expect.poll(() => events.length).toBe(2);
  expect(events[1]).toMatchObject({ kind: "page_view", page: "PAGE-217" });
  expect(events[1]).not.toHaveProperty("source");
  expect(events[0]?.event_id).not.toBe(events[1]?.event_id);
});
