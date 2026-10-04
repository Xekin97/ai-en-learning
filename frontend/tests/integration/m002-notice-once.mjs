import { chromium, webkit, expect, request } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:3311";
const evidence = new URL(
  "../../../.planning/milestones/M002/implementation/evidence/notice-once/",
  import.meta.url,
);
const copy = JSON.parse(
  await readFile(
    new URL(
      "../../../.planning/milestones/M002/design/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const t = (key) => copy.static["en." + key] ?? copy.templates["en." + key];
const results = [],
  errors = [];
const api = await request.newContext();
let browser;
const ready = (p) =>
  p.waitForFunction(() => document.documentElement.dataset.appReady === "true");
try {
  for (const [engine, driver, width] of [
    ["chromium", chromium, 1440],
    ["webkit", webkit, 390],
  ]) {
    await api.post("http://127.0.0.1:38080/api/v1/__test/operations-reset");
    browser = await driver.launch();
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    ctx.setDefaultTimeout(8000);
    await ctx.addCookies([
      { name: "wordweave_session", value: "admin", url: base },
      { name: "wordweave_ui_locale", value: "en-US", url: base },
    ]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/admin/notices");
    await ready(p);
    const once = p.getByRole("checkbox", {
      name: t("remind.once"),
      exact: true,
    });
    await expect(once).not.toBeChecked();
    await once.check();
    await p.getByRole("checkbox", { name: t("remind"), exact: true }).check();
    await p.getByLabel(t("name.en"), { exact: true }).fill("Once alpha");
    await p.locator("textarea").nth(1).fill("Alpha body");
    await p.getByRole("button", { name: t("preview"), exact: true }).click();
    await expect(p.locator("#admin-notice-preview[open]")).toBeVisible();
    expect(
      await p.evaluate(() =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("wordweave.notice-once"),
        ),
      ),
    ).toEqual([]);
    await p.keyboard.press("Escape");
    const saved = p.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().endsWith("/admin/notices/notice-admin"),
    );
    await p.getByRole("button", { name: t("save"), exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({
      remind: true,
      remind_once: true,
    });
    await expect(
      p.getByRole("button", { name: t("save"), exact: true }),
    ).toBeEnabled();
    await p.reload();
    await ready(p);
    await expect(once).toBeChecked();
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await p
      .locator("fieldset")
      .screenshot({
        path: new URL("admin-" + width + ".png", evidence).pathname,
      });
    results.push({
      engine,
      id: "ONCE28-ADMIN",
      result: "PASS",
      width,
      persisted: true,
      previewCounted: false,
    });
    const added = await api.post(base + "/api/v1/admin/notices", {
      data: {
        title: { zh_CN: null, en_US: "Once beta" },
        body_markdown: { zh_CN: null, en_US: "Beta body" },
        visible: true,
        remind: true,
        remind_once: true,
      },
    });
    expect(added.status()).toBe(200);
    const dialog = p.locator("#platform-notice[open]");
    const title = dialog.locator(".notice-heading h2");
    const keys = () =>
      p.evaluate(() =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("wordweave.notice-once"),
        ),
      );
    const close = async () => {
      await dialog
        .locator(".dialog-actions")
        .getByRole("button", { name: t("close"), exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
    };
    const login = async (username = "learner_e2e") => {
      await ctx.clearCookies({ name: "wordweave_session" });
      await p.goto(base + "/login");
      await ready(p);
      await p.getByLabel(t("i.username"), { exact: true }).fill(username);
      await p
        .getByLabel(t("i.password"), { exact: true })
        .fill("CorrectPass123!");
      await p.locator(".auth-form button[type=submit]").click();
      await expect(dialog).toBeVisible();
    };
    await login();
    await expect(title).toHaveText("Once alpha");
    await expect.poll(keys).toHaveLength(1);
    expect((await keys())[0]).toContain("learner-e2e:notice-admin");
    await close();
    await login();
    await expect(title).toHaveText("Once beta");
    await expect.poll(keys).toHaveLength(2);
    await dialog.getByRole("button", { name: t("next"), exact: true }).click();
    await expect(title).toHaveText("Welcome to WordWeave");
    await dialog
      .getByRole("button", { name: t("previous"), exact: true })
      .click();
    await expect(title).toHaveText("Once beta");
    await close();
    await p.reload();
    await ready(p);
    await expect(dialog).toHaveCount(0);
    await login();
    await expect(title).toHaveText("Welcome to WordWeave");
    expect(await keys()).toHaveLength(2);
    await close();
    // Same browser, different real fixture account identity; each records independently.
    await login("admin_e2e");
    await expect(title).toHaveText("Once alpha");
    await expect.poll(keys).toHaveLength(3);
    expect(
      (await keys()).some((k) => k.includes("admin-e2e:notice-admin")),
    ).toBe(true);
    await close();
    await login();
    await expect(title).toHaveText("Welcome to WordWeave");
    await close();
    await p.goto(base + "/notices");
    await ready(p);
    await p.getByRole("button", { name: /Once alpha/ }).click();
    await expect(title).toHaveText("Once alpha");
    expect(await keys()).toHaveLength(3);
    await close();
    await p.evaluate(() => localStorage.clear());
    await p.getByRole("button", { name: /Once alpha/ }).click();
    await expect(title).toHaveText("Once alpha");
    expect(await keys()).toHaveLength(0);
    await close();
    await login();
    await expect(title).toHaveText("Once alpha");
    await expect.poll(keys).toHaveLength(1);
    await close();
    results.push({
      engine,
      id: "ONCE28-LOGIN",
      result: "PASS",
      accountIsolation: true,
      unseenNotCounted: true,
      manualUnrestricted: true,
      refreshSilent: true,
      clearRestores: true,
    });
    await ctx.close();
    await browser.close();
    browser = null;
  }
  expect(errors).toEqual([]);
} catch (e) {
  results.push({ result: "FAIL", message: e.message });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await api.dispose();
  await writeFile(
    new URL("browser-results.json", evidence),
    JSON.stringify({ results, pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify(results));
}
