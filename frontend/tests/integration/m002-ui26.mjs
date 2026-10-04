import { chromium, webkit, firefox, expect, request } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const origin = process.env.UI26_ORIGIN || "http://127.0.0.1:3310";
const evidence = new URL(
  "../../../.planning/milestones/M002/implementation/evidence/frontend-ui26/",
  import.meta.url,
);
const source = JSON.parse(
  await readFile(
    new URL(
      "../../../.planning/milestones/M002/design/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const text = (lang, key) =>
  source.static[`${lang}.${key}`] ?? source.templates[`${lang}.${key}`];
const results = [],
  errors = [];
let pictures = 0;
const t = (key) => text("en", key);
async function shot(page, name) {
  if (pictures++ < 6)
    await page.screenshot({
      path: new URL(name + ".png", evidence).pathname,
      fullPage: true,
    });
}
async function ready(page, path) {
  await page.goto(origin + path);
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}
async function fits(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function select(page, name, option) {
  const field = page.getByRole("combobox", { name, exact: true });
  await field.click();
  await page.getByRole("option", { name: option, exact: true }).click();
  return field;
}
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, result: "PASS" });
  } catch (error) {
    results.push({ name, result: "FAIL", error: error.message });
    throw error;
  }
}
let browser;
try {
  const api = await request.newContext();
  await api.post("http://127.0.0.1:38080/api/v1/__test/admin-presets-reset");
  await api.post("http://127.0.0.1:38080/api/v1/__test/operations-reset");
  await api.post("http://127.0.0.1:38080/api/v1/__test/admin-growth-reset");
  browser = await chromium.launch();
  let context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  context.setDefaultTimeout(8000);
  await context.addCookies([
    { name: "wordweave_session", value: "learner", url: origin },
  ]);
  let page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await check(
    "FE3-V02/V06 ordinary selector and complete catalog selection",
    async () => {
      await ready(page, "/create");
      await expect(page.locator(".word-picker")).toHaveCount(1);
      const model = page.getByRole("combobox", {
        name: t("model"),
        exact: true,
      });
      await model.focus();
      await page.keyboard.press("ArrowDown");
      await expect(model).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(model).toHaveAttribute("aria-expanded", "false");
      await select(
        page,
        t("model"),
        "Quick Context with a deliberately long name for responsive checks",
      );
      await select(page, t("explain"), "English");
      const search = page.getByRole("combobox", {
        name: t("wordsearch"),
        exact: true,
      });
      await page.route("**/api/v1/vocabulary/search?**", (route) =>
        route.fulfill({
          json: {
            data: {
              items: [
                { entry: "according to" },
                { entry: "coup d'etat" },
                { entry: "adapt" },
              ],
              vocabulary_version: "test",
            },
            meta: { request_id: "ui26-search" },
          },
        }),
      );
      await search.fill("according");
      await page
        .getByRole("option", { name: "according to", exact: true })
        .click();
      await expect(page.locator(".word-token")).toContainText("according to");
      await expect(search).toBeFocused();
      await search.fill("according");
      await expect(
        page.getByRole("option", { name: /according to/ }),
      ).toHaveAttribute("aria-disabled", "true");
      await search.press("Escape");
      await search.fill("coup");
      await search.press("Enter"); // Loading must not add arbitrary input.
      await expect(page.locator(".word-token")).toHaveCount(1);
      await expect(
        page.getByRole("option", { name: "coup d'etat", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("option", { name: "coup d'etat", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: `${t("remove")} according to`,
          exact: true,
        })
        .click();
      await expect(page.locator(".word-token")).toHaveText("coup d'etat");
      await fits(page);
      await shot(page, "create-desktop");
    },
  );
  await check(
    "FE3-V08 homepage advantages and FE3-V07 published meanings",
    async () => {
      await ready(page, "/");
      await expect(page.locator(".home-why h2")).toHaveText(t("why.title"));
      await expect(page.locator(".why-feature")).toHaveCount(3);
      await fits(page);
      await shot(page, "home");
      await ready(page, "/explore");
      await expect(page.locator(".preset-meanings").first()).toBeVisible();
      await expect(page.locator(".preset-meanings dt").first()).toHaveText(
        "adapt",
      );
      await expect(page.locator(".preset-meanings dd").first()).not.toBeEmpty();
      await fits(page);
      await shot(page, "meanings");
    },
  );
  await context.close();
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  context.setDefaultTimeout(8000);
  await context.addCookies([
    { name: "wordweave_session", value: "admin", url: origin },
  ]);
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await check(
    "FE3-V03/V06/V07 administrator picker and retained preview",
    async () => {
      await ready(page, "/admin/presets");
      await expect(page.locator(".word-token")).toHaveText("adapt");
      await expect(page.locator(".preset-meanings dt")).toHaveText("adapt");
      const original = await page
        .locator(".preset-meanings dd")
        .allTextContents();
      await select(page, t("style"), "News");
      await expect(page.locator(".preset-meanings dd")).toHaveText(original);
      await expect(
        page.getByRole("button", { name: t("publish"), exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: t("save.draft"), exact: true })
        .click();
      await expect(page.locator(".preset-meanings dd")).toHaveText(original);
      await expect(page.locator(".preset-sample-text")).toContainText(
        "Teams adapt",
      );
      await page.reload();
      await page.waitForFunction(
        () => document.documentElement.dataset.appReady === "true",
      );
      await expect(page.locator(".preset-meanings")).toContainText(
        t("preset.meanings.pending"),
      );
      const search = page.getByRole("combobox", {
        name: t("wordsearch"),
        exact: true,
      });
      await search.fill("adap");
      await page.getByRole("option", { name: "adaptive", exact: true }).click();
      await expect(page.locator(".word-token")).toHaveCount(2);
      const catalog = ["according to", "coup d'etat", "ought to", "owing to"];
      await page.route("**/api/v1/vocabulary/search?**", (route) =>
        route.fulfill({
          json: {
            data: {
              items: catalog.map((entry) => ({ entry })),
              vocabulary_version: "test",
            },
            meta: { request_id: "admin-words" },
          },
        }),
      );
      for (const word of catalog) {
        await search.fill(word);
        await page.getByRole("option", { name: word, exact: true }).click();
      }
      await expect(page.locator(".word-token")).toHaveCount(6);
      await shot(page, "admin-picker");
    },
  );
  await check(
    "FE3-V03 native validity focus and multiple selection inside modal",
    async () => {
      await ready(page, "/admin/growth");
      await page
        .getByRole("button", { name: t("newitem"), exact: true })
        .click();
      const dialog = page.locator("dialog[open]");
      const model = dialog.getByRole("combobox", {
        name: t("model"),
        exact: true,
      });
      await expect(model).toBeVisible();
      await model.click();
      const option = page.getByRole("option", {
        name: "Admin model",
        exact: true,
      });
      await expect(option).toBeVisible();
      await option.click();
      await expect(option).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await expect(model).toHaveAttribute("aria-expanded", "false");
      await model.click();
      await option.click();
      await page.keyboard.press("Escape");
      const proxy = dialog.locator("select[multiple]");
      expect(await proxy.evaluate((e) => e.checkValidity())).toBe(false);
      await expect(model).toBeFocused();
      await page.keyboard.press("Escape");
    },
  );
  await context.close();
  await browser.close();
  browser = null;
  const longBody =
    "<h2>Read and learn</h2><blockquote>Make words your own.</blockquote><ul><li>First word</li><li>Next word</li></ul><pre><code>" +
    "long-code ".repeat(30) +
    "</code></pre><table><thead><tr><th>Word</th><th>Meaning</th></tr></thead><tbody><tr><td>adapt</td><td>change</td></tr></tbody></table>" +
    "<p>Keep learning with a new story and your own words.</p>".repeat(65);
  for (const [engine, driver] of [
    ["chromium", chromium],
    ["webkit", webkit],
    ["firefox", firefox],
  ]) {
    browser = await driver.launch();
    for (const [width, height, lang] of [
      [1440, 900, "en"],
      [390, 844, "zh"],
      [320, 568, "en"],
    ]) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      ctx.setDefaultTimeout(8000);
      await ctx.addCookies([
        { name: "wordweave_session", value: "learner", url: origin },
        {
          name: "wordweave_ui_locale",
          value: lang === "zh" ? "zh-CN" : "en-US",
          url: origin,
        },
      ]);
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      await check(`FE3-V04/V05/V08 ${engine} ${width} ${lang}`, async () => {
        await p.route("**/api/v1/notices/notice-1", (route) =>
          route.fulfill({
            json: {
              data: {
                notice: {
                  id: "notice-1",
                  title:
                    lang === "zh"
                      ? "本周学习提示"
                      : "This week’s learning notes",
                  body_html: longBody,
                  content_locale: lang === "zh" ? "zh-CN" : "en-US",
                  remind: true,
                  published_at: "2026-09-20T01:00:00Z",
                  revision: "test",
                },
              },
              meta: { request_id: "ui26-notice" },
            },
          }),
        );
        await ready(p, "/notices");
        await expect(p.locator(".notice-list .pill")).toHaveCount(0);
        await fits(p);
        if (width === 1440)
          expect(
            (await p.locator(".notices-page").boundingBox()).width,
          ).toBeLessThanOrEqual(881);
        await p.locator(".notice-entry").click();
        const dialog = p.locator("dialog[open]");
        await expect(dialog.locator(".markdown h2")).toHaveText(
          "Read and learn",
        );
        const body = dialog.locator(".notice-reading"),
          header = dialog.locator(".notice-heading"),
          footer = dialog.locator(".dialog-actions");
        await dialog.evaluate((el) =>
          Promise.all(
            el.getAnimations().map((a) => a.finished.catch(() => {})),
          ),
        );
        const beforeH = await header.boundingBox(),
          beforeF = await footer.boundingBox();
        expect(
          await body.evaluate((e) => e.scrollHeight > e.clientHeight),
        ).toBe(true);
        await body.evaluate((e) => {
          e.scrollTop = e.scrollHeight;
        });
        expect(await body.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
        const afterH = await header.boundingBox(),
          afterF = await footer.boundingBox();
        expect(afterH.y).toBeCloseTo(beforeH.y, 0);
        expect(afterF.y).toBeCloseTo(beforeF.y, 0);
        expect(afterF.y + afterF.height).toBeLessThanOrEqual(height);
        expect(afterH.y).toBeGreaterThanOrEqual(0);
        await fits(p);
        if (engine === "chromium" && width !== 390)
          await shot(p, `notice-${width}`);
        await p.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(p.locator(".notice-entry")).toBeFocused();
        await ready(p, "/create");
        const settings = p.locator("details.settings");
        if (!(await settings.evaluate((e) => e.open)))
          await settings.locator("summary").click();
        const style = p.getByRole("combobox", {
          name: text(lang, "style"),
          exact: true,
        });
        await style.click();
        await expect(
          p.getByRole("option", {
            name: text(lang, "a.preset.style.Story"),
            exact: true,
          }),
        ).toBeVisible();
        await p.keyboard.press("End");
        await p.keyboard.press("Enter");
        await expect(style).toHaveAttribute("aria-expanded", "false");
        await fits(p);
        await ready(p, "/");
        await expect(p.locator(".why-feature")).toHaveCount(3);
        await fits(p);
      });
      await ctx.close();
    }
    await browser.close();
    browser = null;
  }
  expect(errors).toEqual([]);
  await api.dispose();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(
    new URL("browser-results.json", evidence),
    JSON.stringify(
      { origin, results, pageErrors: errors, screenshotCount: pictures },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        passed: results.filter((x) => x.result === "PASS").length,
        failed: results.filter((x) => x.result === "FAIL"),
      },
      null,
      2,
    ),
  );
}
