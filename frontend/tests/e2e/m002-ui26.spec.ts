import { selectValue } from "./select-control";
import { expect, test } from "@playwright/test";
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
  source.static[`en.${key}`] ?? source.templates[`en.${key}`];
const ready = (page: import("@playwright/test").Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );

test("word picker recovers from failure, distinguishes empty results and enforces the ordinary cap", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "wordweave_session", value: "learner", url: baseURL! },
  ]);
  let mode = "failed";
  const entries = [
    "adapt",
    "context",
    "resilient",
    "gentle",
    "curious",
    "steady",
  ];
  await page.route("**/api/v1/vocabulary/search?**", (route) =>
    route.fulfill(
      mode === "failed"
        ? {
            status: 503,
            contentType: "application/problem+json",
            json: {
              type: "about:blank",
              title: "Unavailable",
              status: 503,
              code: "temporarily_unavailable",
              detail: "Try again",
              request_id: "search-failed",
            },
          }
        : {
            json: {
              data: {
                items:
                  mode === "empty" ? [] : entries.map((entry) => ({ entry })),
                vocabulary_version: "test",
              },
              meta: { request_id: "search" },
            },
          },
    ),
  );
  await page.goto("/create");
  await ready(page);
  const input = page.getByRole("combobox", {
    name: t("wordsearch"),
    exact: true,
  });
  await input.fill("adapt");
  await expect(page.locator(".word-picker-search-state")).toContainText(
    t("picker.error"),
  );
  mode = "empty";
  await page
    .locator(".word-picker")
    .getByRole("button", { name: t("retry"), exact: true })
    .click();
  await expect(page.locator(".word-picker-search-state")).toContainText(
    t("picker.none"),
  );
  mode = "ready";
  for (const entry of entries.slice(0, 5)) {
    await input.fill(entry);
    await page.getByRole("option", { name: entry, exact: true }).click();
  }
  await expect(page.locator(".word-token")).toHaveCount(5);
  await expect(page.locator(".word-picker-feedback")).toHaveText(
    t("picker.full"),
  );
  await expect(
    page.getByRole("button", { name: t("random"), exact: true }),
  ).toBeDisabled();
  await input.fill("steady");
  await expect(
    page.getByRole("option", { name: "steady", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await input.press("Enter");
  await expect(page.locator(".word-token")).toHaveCount(5);
  await page
    .getByRole("button", { name: `${t("remove")} adapt`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: t("random"), exact: true }),
  ).toBeEnabled();
});

test("published meanings keep their snapshot language when the interface language changes", async ({
  page,
  request,
}) => {
  const raw = await (
    await request.get("http://127.0.0.1:38080/api/v1/presets")
  ).json();
  const meanings = [
    "适应新情况",
    "change to fit a new situation",
    "新しい状況に適応する",
  ];
  const items = ["zh", "en", "ja"].map((lang, index) => {
    const item = structuredClone(raw.data.items[0]);
    item.id = `preset-${lang}`;
    item.configuration.meaning_language = lang;
    item.sample.targets[0].entry_meaning = meanings[index];
    return item;
  });
  await page.route("**/api/v1/presets?**", (route) =>
    route.fulfill({
      json: {
        data: { items },
        meta: { request_id: "meanings", has_more: false, next_cursor: null },
      },
    }),
  );
  await page.goto("/");
  await ready(page);
  await page.getByRole("link", { name: t("nav.explore"), exact: true }).click();
  await expect(page.locator(".gallery-config .preset-meanings dd")).toHaveText(
    meanings,
  );
  await expect(page.locator(".gallery-paper .preset-meanings")).toHaveCount(0);
  await expect(page.locator(".gallery-words")).toHaveCount(0);
  await expect(page.locator(".preset-meanings-head > span")).toHaveText([
    "中文",
    "English",
    "日本語",
  ]);
  await expect(
    page.locator(
      ".gallery-config > .gallery-facts + .preset-meanings + .gallery-cta",
    ),
  ).toHaveCount(items.length);
  await selectValue(
    page.getByRole("combobox", { name: t("language"), exact: true }),
    "zh-CN",
  );
  await expect(page.locator(".preset-meanings dd")).toHaveText(meanings);
  await expect(page.locator(".preset-meanings-head > span")).toHaveText([
    "中文",
    "English",
    "日本語",
  ]);
  await expect(page.locator(".preset-meanings dt")).toHaveText([
    "adapt",
    "adapt",
    "adapt",
  ]);
});

test("message pagination resets the reading position and keeps the welcome overlay", async ({
  page,
}) => {
  const notice = (id: string) => ({
    id,
    title: id,
    body_html: "<p>Keep learning with a new story.</p>".repeat(
      id === "notice-1" ? 60 : 1,
    ),
    content_locale: "en-US",
    remind: true,
    published_at: "2026-09-20T01:00:00Z",
    revision: "test",
  });
  await page.route("**/api/v1/notices**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: {
        data:
          path === "/api/v1/notices"
            ? { items: [notice("notice-1"), notice("notice-2")] }
            : { notice: notice(path.split("/").at(-1)!) },
        meta: {
          request_id: "pagination",
          ...(path === "/api/v1/notices"
            ? { next_cursor: null, has_more: false }
            : {}),
        },
      },
    });
  });
  await page.goto("/login");
  await ready(page);
  await page.getByLabel(t("i.username"), { exact: true }).fill("learner_e2e");
  await page
    .getByLabel(t("i.password"), { exact: true })
    .fill("CorrectPass123!");
  await page.locator(".auth-form button[type=submit]").click();
  const dialog = page.locator("dialog[open]"),
    body = dialog.locator(".notice-reading");
  await expect(dialog.locator(".notice-heading h2")).toHaveText("notice-1");
  await expect(page.locator("#toast")).toBeVisible();
  expect(
    await page.locator("#toast").evaluate((el) => el.parentElement?.tagName),
  ).toBe("DIALOG");
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: t("next"), exact: true }).click();
  await expect(dialog.locator(".notice-heading h2")).toHaveText("notice-2");
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(dialog.locator(".dialog-actions")).toBeInViewport();
});
