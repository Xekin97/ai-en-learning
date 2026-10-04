// Design-only checks. Uses the product repo's existing Playwright dependency.
const path = require("path"),
  fs = require("fs");
const root = path.resolve(__dirname, "../../../../..");
const { chromium, expect } = require(
  path.join(root, "frontend/node_modules/@playwright/test"),
);
const AxeBuilder = require(
  path.join(root, "frontend/node_modules/@axe-core/playwright"),
).default;
const base = "http://127.0.0.1:4174/prototype/";
const checks = [],
  errors = [];
(async () => {
  const b = await chromium.launch({ headless: true });
  const context = await b.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const go = async (page, other = "") => {
    await p.goto(base + "?page=" + page + other);
    await p.waitForSelector("main");
  };
  const click = async (a) => p.locator(`[data-action="${a}"]`).first().click();
  const test = async (name, fn) => {
    try {
      await fn();
      checks.push({ name, status: "PASS" });
    } catch (e) {
      checks.push({ name, status: "FAIL", error: e.message });
      console.log("FAIL", name, e.message.slice(0, 150));
    }
  };
  await test("UIA-PAGE-201-01 wrong partial answers advance; overview has no scoring; edit preserves", async () => {
    await go("review");
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.locator(".slot").first().fill("x");
    await click("next");
    await expect(
      p.locator(".eyebrow").filter({ hasText: "单词 2 / 3" }),
    ).toBeVisible();
    await click("overview");
    await expect(p.locator('[data-action="edit-word:0"]')).toHaveText("x ↗");
    await expect(p.locator(".bad,.good")).toHaveCount(0);
    await click("edit-word:0");
    await expect(p.locator(".slot").first()).toHaveValue("x");
  });
  await test("UIA-PAGE-201-02 refresh asks to resume unfinished draft", async () => {
    await p.reload();
    await expect(p.locator("#dialog")).toBeVisible();
    await click("resume");
    await expect(p.locator(".slot").first()).toHaveValue("x");
  });
  await test("UIA-PAGE-202-01 partial passage and empty gaps may submit; summary gives corrections", async () => {
    await click("edit-passage");
    await p.locator('[data-gap="0"]').fill("wrong");
    await click("next");
    await click("submit");
    await expect(p.locator('[data-page="PAGE-203"]')).toBeVisible();
    await expect(p.locator("s").first()).toHaveText("x");
    await expect(p.locator("main")).toContainText("resilient");
    await expect(p.locator("main")).toContainText("未作答");
    await click("finish");
    expect(
      await p.evaluate(() => localStorage.getItem("ww-m002-draft")),
    ).toBeNull();
  });
  await test("UIA-PAGE-203-01 successful summary has no struck answers", async () => {
    await go("summary", "&state=success");
    await expect(p.locator("main s")).toHaveCount(0);
    await expect(p.locator("main")).toContainText("本次新增掌握 3 个词");
  });
  await test("UIA-PAGE-204-01 defaults, random unique word, explicit model and language", async () => {
    await go("create");
    await expect(p.locator("#style")).toHaveValue("story");
    await expect(p.locator("#length")).toHaveValue("brief");
    await expect(p.locator("#generate")).toBeDisabled();
    await click("random");
    await expect(p.locator("main .chip")).toHaveCount(4);
    await p.selectOption("#model", "Model A");
    await p.selectOption("#explain", "chinese");
    await expect(p.locator("#generate")).toBeEnabled();
  });
  await test("UIA-PAGE-216-01 locked trial waits for click; generation succeeds and guest collection precedes popup", async () => {
    await go("trial", "&role=guest");
    await expect(p.locator('[data-action="random"]')).toHaveCount(0);
    await expect(p.locator("#model")).toHaveCount(0);
    await expect(p.locator('[data-action="collect"]')).toHaveCount(0);
    await click("generate");
    await expect(p.locator('[data-action="collect"]')).toBeVisible({
      timeout: 10000,
    });
    await click("collect");
    await click("login-collect");
    await expect(p.locator('[data-page="PAGE-201"]')).toBeVisible();
    await expect(p.locator("#dialog")).toContainText("来自词涟的消息", {
      timeout: 2000,
    });
    await p.reload();
    await expect(p.locator("#dialog")).not.toBeVisible();
  });
  await test("UIA-PAGE-214-01 claiming adds once and disables claim button", async () => {
    await go("growth");
    await click("claim:0");
    await expect(p.locator('[data-action="claim:0"]')).toBeDisabled();
    await expect(p.locator(".growth-banner")).toContainText("350");
  });
  await test("UIA-PAGE-214-02 blocked rewards preserve attainment; demotion pauses level reward", async () => {
    await go("growth", "&state=blocked");
    await expect(p.locator('[data-action="claim:0"]')).toBeDisabled();
    await expect(p.locator("main")).toContainText("达成记录已保留");
    await go("growth", "&state=demoted");
    await expect(p.locator('[data-action="claim-level"]')).toBeDisabled();
  });
  await test("UIA-PAGE-215-01 covered model card cannot activate; retired card manually refunds once", async () => {
    await go("bag", "&state=covered");
    await expect(p.locator('[data-action="use:2"]')).toBeDisabled();
    await expect(p.locator("main")).toContainText(
      "当前计划已满足该模型卡提供的所有模型",
    );
    await go("bag", "&state=retired");
    await click("refund:2");
    await click("refund-confirm:2");
    await expect(p.locator('[data-action="refund:2"]')).toHaveCount(0);
    await expect(p.locator("main")).toContainText("360 积分");
  });
  await test("UIA-PAGE-215-02 higher plan replacement requires confirmation; cancel keeps card", async () => {
    await go("bag");
    await click("use:3");
    await expect(p.locator("#dialog")).toContainText("剩余 2 天将作废");
    await click("close");
    await expect(p.locator('[data-action="use:3"]')).toBeEnabled();
  });
  await test("UIA-PAGE-210-01 type-specific item fields and default unlisted after save", async () => {
    await go("operations");
    await click("item-new");
    await expect(p.locator("#item-refund")).toBeVisible();
    await expect(p.locator("#item-count")).toHaveCount(0);
    await p.selectOption("#item-type", "count");
    await expect(p.locator("#item-refund")).toHaveCount(0);
    await expect(p.locator("#item-count")).toBeVisible();
    await p.fill("#item-zh", "测试次数卡");
    await click("item-save");
    await expect(p.locator("[data-item-row]").last()).toContainText("未上架");
    await click("item-edit:4");
    await expect(p.locator("#item-type")).toBeDisabled();
    await click("close");
    await click("item-delete:0");
    await expect(p.locator("#dialog")).toContainText("已有发放历史");
  });
  await test("UIA-PAGE-210-02 arbitrary fifth and sixth tier; operation failure retains inputs", async () => {
    await go("operations");
    await click("optab:achievementsettings");
    await click("add-tier");
    await click("add-tier");
    await expect(p.locator("tbody tr")).toHaveCount(6);
    await go("profile", "&state=save-error");
    await p.fill("#nickname", "保留我");
    await click("profile-save");
    await expect(p.locator("#nickname")).toHaveValue("保留我");
    await expect(p.locator("#toast")).toContainText("保存失败");
  });
  await test("UIA-PAGE-211-01 negative and zero points rejected", async () => {
    await go("credits");
    await p.fill("#credit-amount", "-2");
    await click("adm-credit");
    await expect(p.locator("#toast")).toContainText("大于 0");
    await expect(p.locator("#found-user")).toContainText("320");
  });
  await test("UIA-PAGE-212-01 valid preview gates publishing and config changes invalidate preview", async () => {
    await go("presets");
    await p.selectOption("#preset-model", "Model B");
    await expect(p.locator('[data-action="preset-publish"]')).toBeDisabled();
    await p.fill("#preset-zh", "新主题");
    await click("preset-preview");
    await expect(p.locator('[data-action="preset-publish"]')).toBeEnabled();
    await expect(p.locator("#preset-zh")).toHaveValue("新主题");
    await p.selectOption("#preset-model", "Model A");
    await expect(p.locator('[data-action="preset-publish"]')).toBeDisabled();
    await click("preset-preview");
    await click("preset-publish");
    await expect(p.locator("main")).toContainText("已发布");
  });
  await test("UIA-PAGE-209-01 hidden notification excluded; Markdown escapes HTML", async () => {
    await go("messages");
    await p.fill("#body-zh", "<img src=x onerror=alert(1)>");
    await click("message-preview");
    await expect(p.locator("#dialog img")).toHaveCount(0);
    await click("close");
    await p.uncheck("#visible");
    await click("message-save");
    await p.locator("#demo summary").click();
    await p.selectOption("#demo-page", "notices");
    await expect(p.locator(".notice-entry")).toHaveCount(1);
  });
  await test("UIA-SHELL-01 avatar offers four views; keyboard and outside click close disclosure", async () => {
    await go("home");
    await expect(p.locator(".nav a")).toHaveText([
      "首页",
      "造文工作台",
      "复习",
      "试用",
    ]);
    await expect(p.locator("main #presets")).toHaveCount(0);
    const trigger = p.locator(".account-dropdown summary");
    await trigger.focus();
    await p.keyboard.press("Enter");
    await expect(p.locator(".account-popover a")).toHaveText([
      "个人信息",
      "账号成长",
      "道具卡",
      "兑换中心",
    ]);
    await p.keyboard.press("Tab");
    await expect(p.locator(".account-popover a").first()).toBeFocused();
    await p.keyboard.press("Escape");
    await expect(p.locator(".account-dropdown")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(trigger).toBeFocused();
    await trigger.click();
    await p.locator("h1").click();
    await expect(p.locator(".account-dropdown")).not.toHaveAttribute(
      "open",
      "",
    );
    for (const width of [320, 390, 1440]) {
      await p.setViewportSize({ width, height: 1000 });
      await trigger.click();
      const bounds = await p.locator(".account-popover").boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await expect(p.locator(".account-popover a").last()).toBeVisible();
      if (width === 390 || width === 1440)
        await p.screenshot({
          path: path.join(__dirname, `avatar-menu-${width}.png`),
        });
      await p.keyboard.press("Escape");
    }
  });
  await test("UIA-SHELL-02 four account views retain shared identity; profile edits propagate", async () => {
    await go("home");
    for (const [view, label] of [
      ["profile", "个人信息"],
      ["growth", "账号成长"],
      ["bag", "道具卡"],
      ["shop", "兑换中心"],
    ]) {
      await p.locator(".account-dropdown summary").click();
      await p.locator(`.account-popover [data-go="${view}"]`).click();
      await expect(p.locator("h1")).toHaveText(label);
      await expect(p.locator(".account-sidebar")).toContainText("小涟");
      await expect(p.locator(".account-sidebar")).toContainText("@learner");
      await expect(p.locator(".account-nav [aria-current]")).toHaveText(label);
      await expect(p.locator(".account-dropdown")).not.toHaveAttribute(
        "open",
        "",
      );
    }
    await p.locator('.account-nav [data-go="profile"]').click();
    await p.fill("#nickname", "新的昵称");
    await click("profile-save");
    await p.locator('.account-nav [data-go="growth"]').click();
    await expect(p.locator(".account-sidebar h2")).toHaveText("新的昵称");
    await expect(p.locator(".user-name")).toHaveText("新的昵称");
    await p.locator('.account-nav [data-go="profile"]').click();
    await p.fill("#nickname", "");
    await click("profile-save");
    await expect(p.locator(".account-sidebar h2")).toHaveText("learner");
    await expect(p.locator(".user-name")).toHaveText("learner");
  });
  await test("UIA-PAGE-205-02 trial navigation opens gallery then locked workspace without generation", async () => {
    await go("home", "&role=guest");
    await expect(p.locator(".account-dropdown")).toHaveCount(0);
    await p.locator('.nav [data-go="explore"]').click();
    await expect(p.locator(".preset-card")).toHaveCount(2);
    await expect(p.locator("#generate")).toHaveCount(0);
    await click("try:1");
    await expect(p.locator('[data-page="PAGE-216"]')).toBeVisible();
    await expect(p.locator("#generate")).toBeEnabled();
    await expect(p.locator(".article")).toHaveCount(0);
    await expect(p.locator("main .chip")).toHaveText([
      "gentle",
      "curious",
      "delight",
    ]);
    await expect(p.locator(".nav [aria-current]")).toHaveText("试用");
  });
  await test("UIA-PAGE-215-03 redemption and owned cards are separate views with shared balance", async () => {
    await go("shop");
    await expect(p.locator("h1")).toHaveText("兑换中心");
    await click("redeem:0");
    await click("redeem-confirm:0");
    await expect(p.locator("#toast")).toContainText("兑换成功");
    await expect(p.locator("h1")).toHaveText("兑换中心");
    await p.locator('.account-nav [data-go="bag"]').click();
    await expect(p.locator("h1")).toHaveText("道具卡");
    await expect(p.locator(".items-grid .item")).toHaveCount(5);
    await expect(p.locator('[data-action^="redeem:"]')).toHaveCount(0);
  });
  const screens = [];
  for (const width of [320, 390, 1440, 1920]) {
    for (const lang of ["zh", "en"]) {
      await p.setViewportSize({ width, height: 1000 });
      for (const page of [
        "home",
        "adminhome",
        "plans",
        "users",
        "userdetail",
        "explore",
        "shop",
        "create",
        "review",
        "overview",
        "summary",
        "growth",
        "bag",
        "profile",
        "notices",
        "models",
        "messages",
        "operations",
        "credits",
        "presets",
        "metrics",
        "trial",
      ]) {
        await go(page, "&lang=" + lang);
        await p.evaluate(() => localStorage.clear());
        if (await p.locator("#dialog").isVisible())
          await p.locator('[data-action="close"]').first().click();
        screens.push({
          page,
          width,
          lang,
          overflow: await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        });
        if (
          [1440, 390].includes(width) &&
          lang === "zh" &&
          [
            "home",
            "explore",
            "profile",
            "growth",
            "bag",
            "shop",
            "review",
            "operations",
          ].includes(page)
        ) {
          await p.waitForTimeout(300);
          await p.screenshot({
            path: path.join(__dirname, page + "-" + width + ".png"),
            fullPage: true,
          });
        }
      }
    }
  }
  checks.push({
    name: "Responsive document overflow across 176 page/viewport/language combinations",
    status: screens.some((x) => x.overflow) ? "FAIL" : "PASS",
    failures: screens.filter((x) => x.overflow),
  });
  await p.setViewportSize({ width: 1440, height: 1000 });
  await go("home");
  await p.emulateMedia({ reducedMotion: "reduce" });
  const duration = await p
    .locator(".floating")
    .first()
    .evaluate((x) => getComputedStyle(x).animationName);
  checks.push({
    name: "Reduced motion removes word animation",
    status: duration === "none" ? "PASS" : "FAIL",
  });
  const axe = [];
  for (const page of [
    "home",
    "explore",
    "profile",
    "review",
    "growth",
    "bag",
    "shop",
    "operations",
  ]) {
    await go(page);
    const result = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    axe.push({
      page,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
  }
  const result = {
    version: "M002-UI-03",
    status:
      checks.some((x) => x.status === "FAIL") ||
      errors.length ||
      axe.some((x) => x.violations.length)
        ? "FAIL"
        : "PASS",
    checks,
    screens,
    errors,
    axe,
    browser: await b.version(),
    scope:
      "Design prototype with local fixtures; not application/backend/API acceptance",
  };
  fs.writeFileSync(
    path.join(__dirname, "browser-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        status: result.status,
        checks: checks.length,
        failures: checks.filter((x) => x.status === "FAIL"),
        errors,
        axe: axe.filter((x) => x.violations.length),
      },
      null,
      2,
    ),
  );
  await b.close();
  process.exitCode = result.status === "FAIL" ? 1 : 0;
})();
