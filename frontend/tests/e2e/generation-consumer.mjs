import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.G14_BASE_URL ?? "http://127.0.0.1:16010";
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const mode of [
    "valid",
    "failed",
    "eof",
    "malformed",
    "cancel",
    "cancel-loses",
    "early-cancel",
    "leave",
    "locale",
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await context.addCookies([
      {
        name: "wordweave_g14",
        value: mode === "locale" ? "hold" : mode,
        url: base,
      },
    ]);
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === base
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    let streams = 0,
      cancels = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (req) => {
      if (req.url().endsWith("/generations/stream")) streams++;
      if (req.url().endsWith("/cancel")) cancels++;
    });
    await page.goto(base + "/create");
    await page.waitForFunction(
      () => document.documentElement.dataset.appReady === "true",
    );
    await page.locator("#word-search").fill("ada");
    await page
      .locator(".word-search-overlay")
      .getByRole("option", { name: "adapt", exact: true })
      .click();
    await page.locator(".choice-grid-model button.choice").first().click();
    await page
      .locator(".choice-grid-3 button.choice")
      .filter({ hasText: "English" })
      .click();
    await page
      .locator(".choice-grid-scenario button.choice")
      .filter({ hasText: "Story" })
      .click();
    await page
      .locator(".choice-grid-4 button.choice")
      .filter({ hasText: "Brief" })
      .click();
    await page.locator(".generate-bar .button-primary").click();
    if (
      mode === "cancel" ||
      mode === "cancel-loses" ||
      mode === "early-cancel"
    ) {
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator(".output-header .button-danger-quiet").click();
    }
    if (mode === "valid" || mode === "cancel-loses") {
      await page.locator(".result-action-bar").waitFor();
      assert.equal(
        await page.locator(".reading-passage").innerText(),
        "We adapt. 🙂",
      );
      assert.equal(await page.locator(".resource-grid").count(), 1);
    } else if (mode === "leave") {
      await page.waitForFunction(
        () =>
          document.querySelector(".stream-passage")?.textContent?.trim() ===
          "We adapt.",
      );
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator('.main-nav a[href="/library"]').click();
      await page.waitForURL("**/library");
      assert.equal(cancels, 0);
      await page.locator('.main-nav a[href="/create"]').click();
      await page.locator(".output-empty").waitFor();
      assert.equal(await page.locator(".result-action-bar").count(), 0);
    } else if (mode === "locale") {
      await page.locator(".stream-status").waitFor();
      await page
        .locator(".app-header .locale-switch select")
        .selectOption("zh-CN");
      await page.waitForFunction(
        () =>
          document.querySelector(".brand-name")?.textContent?.trim() === "词涟",
      );
      assert.equal(await page.locator(".stream-status").count(), 1);
      assert.equal(
        await page.locator(".reading-passage").innerText(),
        "We adapt.",
      );
    } else {
      await page.locator(".output-empty").waitFor();
      assert.equal(await page.locator(".result-action-bar").count(), 0);
      assert.equal(
        await page.locator(".generate-bar .button-primary").isEnabled(),
        true,
      );
    }
    assert.equal(streams, 1);
    assert.equal(cancels, mode.includes("cancel") ? 1 : 0);
    assert.deepEqual(errors, []);
    results.push({ mode, passed: true, streams, cancels, pageErrors: errors });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(
  JSON.stringify({
    passed: results.length,
    scope: "synthetic PAGE-004 DOM, real fetch/SSE, no UAT or model call",
  }),
);
