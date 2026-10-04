import { chromium, webkit, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const origin = process.env.UI26_ORIGIN || "http://127.0.0.1:3311";
const evidence = new URL(
  "../../../.planning/milestones/M002/implementation/evidence/frontend-search27/",
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
const t = (lang, key) =>
  source.static[`${lang}.${key}`] ?? source.templates[`${lang}.${key}`];
const results = [],
  errors = [];
let browser;
try {
  for (const [engine, driver] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    browser = await driver.launch();
    for (const [role, path, width, lang] of [
      ["learner", "/create", 1440, "en"],
      ["admin", "/admin/presets", 390, "zh"],
      ["learner", "/create", 320, "en"],
    ]) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
      });
      ctx.setDefaultTimeout(8000);
      await ctx.addCookies([
        { name: "wordweave_session", value: role, url: origin },
        {
          name: "wordweave_ui_locale",
          value: lang === "zh" ? "zh-CN" : "en-US",
          url: origin,
        },
      ]);
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(origin + path);
      await p.waitForFunction(
        () => document.documentElement.dataset.appReady === "true",
      );
      const input = p.locator(".word-picker input"),
        popup = p.locator(".word-picker-popup"),
        loading = p.locator(".word-picker-search-state.is-loading");
      await input.fill("garden");
      await p.getByRole("option", { name: "garden", exact: true }).click();
      await expect(
        p.locator(".word-token").filter({ hasText: "garden" }),
      ).toHaveCount(1);
      await input.fill("learn");
      await expect(
        p.getByRole("option", { name: "learn", exact: true }),
      ).toBeVisible();
      await expect(
        p.getByRole("option", { name: "adapt", exact: true }),
      ).toHaveCount(0);
      await input.press("Escape");
      let release, pending, routeDone;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const done = new Promise((resolve) => {
        routeDone = resolve;
      });
      await p.route("**/api/v1/vocabulary/search?**", async (route) => {
        const q = new URL(route.request().url()).searchParams.get("q");
        if (q !== "context") return route.continue();
        pending = true;
        await gate;
        try {
          await route.fulfill({
            json: {
              data: {
                items: [{ entry: "context" }],
                vocabulary_version: "test",
              },
              meta: { request_id: "slow-search" },
            },
          });
        } finally {
          routeDone();
        }
      });
      await input.fill("context");
      await expect.poll(() => pending).toBe(true);
      await expect(loading).toBeVisible();
      await expect(loading).toHaveText(t(lang, "picker.loading"));
      await expect(input).toHaveAttribute("aria-busy", "true");
      const geometry = await loading.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        fontSize: getComputedStyle(el).fontSize,
      }));
      expect(geometry).toEqual({ height: 50, fontSize: "14px" });
      await expect(
        p.getByRole("option", { name: "context", exact: true }),
      ).toHaveCount(0);
      const before = await p.locator(".word-token").count();
      await input.press("Enter");
      await expect(p.locator(".word-token")).toHaveCount(before);
      const spinner = loading.locator(".word-picker-spinner");
      expect(
        await spinner.evaluate((el) => getComputedStyle(el).animationName),
      ).toBe("word-picker-spin");
      if (engine === "chromium" && width !== 320)
        await popup.screenshot({
          path: new URL(`${role}-${width}.png`, evidence).pathname,
          animations: "disabled",
        });
      await p.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await spinner.evaluate((el) => getComputedStyle(el).animationName),
      ).toBe("none");
      await p
        .getByRole("button", { name: t(lang, "picker.clear"), exact: true })
        .click();
      await expect(popup).toHaveCount(0);
      release();
      await done;
      await p.unroute("**/api/v1/vocabulary/search?**");
      await expect(input).toHaveValue("");
      await expect(input).toHaveAttribute("aria-busy", "false");
      await expect(
        p.getByRole("option", { name: "context", exact: true }),
      ).toHaveCount(0);
      await p.evaluate(() => {
        window.__searchLoadingShown = false;
        const node = document.querySelector(".word-picker");
        window.__searchLoadingObserver = new MutationObserver(() => {
          if (node.querySelector(".is-loading"))
            window.__searchLoadingShown = true;
        });
        window.__searchLoadingObserver.observe(node, {
          subtree: true,
          childList: true,
        });
      });
      await input.fill("resilient");
      await expect(
        p.getByRole("option", { name: "resilient", exact: true }),
      ).toBeVisible();
      expect(
        await p.evaluate(() => {
          window.__searchLoadingObserver.disconnect();
          return window.__searchLoadingShown;
        }),
      ).toBe(false);
      await input.fill("zzzzzzzzzz");
      await expect(p.locator(".word-picker-search-state")).toHaveText(
        t(lang, "picker.none"),
      );
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      results.push({
        engine,
        role,
        width,
        lang,
        result: "PASS",
        geometry,
        loadingCanceled: true,
        fastSearchNoFlash: true,
      });
      await ctx.close();
    }
    await browser.close();
    browser = null;
  }
  expect(errors).toEqual([]);
} catch (error) {
  results.push({ result: "FAIL", message: error.message });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(
    new URL("browser-results.json", evidence),
    JSON.stringify({ results, pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify(results));
}
