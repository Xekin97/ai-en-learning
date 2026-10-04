const path = require("path"),
  fs = require("fs");
const root = path.resolve(__dirname, "../../../../..");
const { chromium, expect } = require(
  path.join(root, "frontend/node_modules/@playwright/test"),
);
const AxeBuilder = require(
  path.join(root, "frontend/node_modules/@axe-core/playwright"),
).default;
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const p = await context.newPage();
  const checks = [],
    errors = [],
    axe = [],
    screens = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const go = async (page, state = "") => {
    await p.goto("http://127.0.0.1:4174/prototype/?page=" + page + state);
    await p.waitForSelector("main");
  };
  const click = (a) => p.locator(`[data-action="${a}"]`).first().click();
  const nav = (page) => p.locator(`.admin-nav [data-go="${page}"]`).click();
  const demo = async (page) => {
    if (!(await p.locator("#demo-page").isVisible()))
      await p.locator("#demo summary").click();
    await p.selectOption("#demo-page", page);
  };
  const test = async (name, fn) => {
    try {
      await fn();
      checks.push({ name, status: "PASS" });
    } catch (e) {
      checks.push({ name, status: "FAIL", error: e.message });
      console.log("FAIL", name, e.message.slice(0, 250));
    }
  };
  await test("ADM-01 eight independent modules, separate admin header and active state", async () => {
    await go("adminhome");
    expect(await p.locator(".admin-nav a").allTextContents()).toEqual([
      "01概览",
      "02数据分析",
      "03模型管理",
      "04计划管理",
      "05用户管理",
      "06成长运营",
      "07消息管理",
      "08首页预设",
    ]);
    await nav("messages");
    await expect(p.locator("h1")).toHaveText("消息管理");
    await expect(p.locator(".admin-nav [aria-current]")).toContainText(
      "消息管理",
    );
    await expect(p.locator('.topbar [data-go="create"]')).toHaveCount(0);
  });
  await test("ADM-02 credential save/cancel clears secret inputs; only masked status is rendered", async () => {
    await go("models");
    await click("adm-key");
    await p.fill("#admin-key", "fixture-not-a-real-key");
    await click("adm-key-save");
    await expect(p.locator("#dialog")).not.toBeVisible();
    await expect(p.locator("#admin-key")).toHaveValue("");
    expect(await p.locator("body").innerText()).not.toContain(
      "fixture-not-a-real-key",
    );
    await click("adm-key");
    await expect(p.locator("#admin-key")).toHaveValue("");
    await p.fill("#admin-key", "another-fixture");
    await click("close");
    await expect(p.locator("#admin-key")).toHaveValue("");
  });
  await test("ADM-03 model create/edit/disable and failed save preserves draft", async () => {
    await go("models");
    await click("adm-model-new");
    await p.fill("#admin-model-name", "Model C");
    await p.fill("#admin-model-provider", "example/model-c");
    await p.fill("#admin-model-desc", "Demo description");
    await click("adm-model-save");
    await expect(p.locator("tbody tr")).toHaveCount(3);
    await click("adm-model-edit:2");
    await expect(p.locator("#admin-model-provider")).toHaveValue(
      "example/model-c",
    );
    await p.uncheck("#admin-model-enabled");
    await click("adm-model-save");
    await expect(p.locator("tbody tr").last()).toContainText("已停用");
    await go("models", "&state=save-error");
    await click("adm-model-edit:0");
    await p.fill("#admin-model-name", "保留编辑");
    await click("adm-model-save");
    await expect(p.locator("#admin-model-name")).toHaveValue("保留编辑");
    await expect(p.locator("#dialog #admin-error")).toContainText("保存失败");
  });
  await test("ADM-04 model removal previews exact plan/card/preset impact and unlinks plans", async () => {
    await go("models");
    await click("adm-model-remove:0");
    await expect(p.locator("#dialog")).toContainText("访客");
    await expect(p.locator("#dialog")).toContainText("移除后该计划无模型");
    await expect(p.locator("#dialog")).toContainText("模型探索卡");
    await click("close");
    await expect(p.locator("tbody tr")).toHaveCount(2);
    await click("adm-model-remove:0");
    await click("adm-model-delete");
    await expect(p.locator("tbody tr")).toHaveCount(1);
    await nav("plans");
    await expect(p.locator("#plan-warning")).toContainText("没有可用模型");
  });
  await test("ADM-05 four fixed plans, complete settings, unique priority and zero/unlimited distinction", async () => {
    await go("plans");
    await expect(p.locator(".tabs button")).toHaveCount(4);
    await expect(p.locator('input[name="plan-length"]')).toHaveCount(4);
    await p.fill("#plan-priority", "0");
    await click("adm-plan-save");
    await expect(p.locator("#admin-error")).toContainText("优先级");
    await p.fill("#plan-priority", "5");
    await p.fill("#plan-max", "12");
    await click("adm-plan-select:pro");
    await click("adm-plan-select:basic");
    await expect(p.locator("#plan-max")).toHaveValue("12");
    await p.check('input[name="plan-model"][value="m2"]');
    await p.check('input[name="plan-length"][value="xlong"]');
    await p.fill("#plan-limit", "0");
    await p.locator("#plan-limit").blur();
    await expect(p.locator("#plan-warning")).toContainText("次数为 0");
    await click("adm-plan-save");
    await expect(p.locator("#dialog")).toContainText(
      "已用次数和体验结束时间保持",
    );
    await click("adm-plan-confirm");
    await click("adm-plan-select:plus");
    await expect(p.locator("#plan-unlimited")).toBeChecked();
    await expect(p.locator("#plan-limit")).toBeDisabled();
    await click("adm-plan-select:basic");
    await expect(p.locator("#plan-max")).toHaveValue("12");
    await expect(p.locator("#plan-limit")).toHaveValue("0");
    await expect(
      p.locator('input[name="plan-length"][value="xlong"]'),
    ).toBeChecked();
  });
  await test("ADM-06 username search is case-insensitive, paginates, and survives return from details", async () => {
    await go("users");
    await p.fill("#admin-user-query", "LEAR");
    await click("adm-search");
    await expect(p.locator("tbody tr")).toHaveCount(1);
    await click("adm-user:u1");
    await expect(p.locator(".admin-user-banner")).toContainText("learner");
    await p.locator('.page-head [data-go="users"]').click();
    await expect(p.locator("#admin-user-query")).toHaveValue("LEAR");
    await p.fill("#admin-user-query", "absent");
    await click("adm-search");
    await expect(p.locator("main")).toContainText("没有匹配");
    await p.fill("#admin-user-query", "");
    await click("adm-search");
    await expect(p.locator("tbody tr")).toHaveCount(2);
    await click("adm-more");
    await expect(p.locator("tbody tr")).toHaveCount(3);
    await click("adm-user:u3");
    await expect(p.locator('[data-action="adm-user-plan"]')).toHaveCount(0);
    await expect(p.locator('[data-action="adm-password"]')).toHaveCount(0);
  });
  await test("ADM-07 user plan adjustment excludes visitor, confirms scoped quota reset", async () => {
    await go("userdetail");
    await click("adm-user-plan");
    await expect(p.locator("#base-plan option")).toHaveCount(3);
    await p.selectOption("#base-plan", "pro");
    await expect(p.locator("#dialog")).toContainText("不影响体验卡或奖励");
    await click("adm-user-plan-save");
    await expect(p.locator(".admin-facts")).toContainText("Pro");
    await expect(p.locator(".admin-facts")).toContainText("20");
  });
  await test("ADM-08 password mismatch stays editable; confirmation explains session revocation", async () => {
    await go("userdetail");
    await click("adm-password");
    await expect(p.locator("#dialog")).toContainText("全部旧会话失效");
    await p.fill("#admin-password", "password-fixture");
    await p.fill("#admin-password-confirm", "different-fixture");
    await click("adm-password-save");
    await expect(p.locator("#admin-error")).toContainText("不一致");
    await p.fill("#admin-password-confirm", "password-fixture");
    await click("adm-password-save");
    await expect(p.locator("#dialog")).not.toBeVisible();
    await expect(p.locator("#admin-password")).toHaveValue("");
  });
  await test("ADM-09 points positive-only, explicit confirmation, ledger and independent XP", async () => {
    await go("userdetail");
    await click("adm-user-tab:points");
    await p.fill("#credit-amount", "-2");
    await click("adm-credit");
    await expect(p.locator("#admin-error")).toContainText("大于 0");
    await p.fill("#credit-amount", "15");
    await p.fill("#credit-reason", "测试补发");
    await click("adm-credit");
    await click("close");
    await expect(p.locator("#found-user")).toContainText("320");
    await click("adm-credit");
    await click("adm-credit-confirm");
    await expect(p.locator("#found-user")).toContainText("335");
    await expect(p.locator("tbody tr").first()).toContainText("管理员补发");
    await expect(p.locator("tbody tr").first()).toContainText("测试补发");
    await click("adm-user-tab:growth");
    await expect(p.locator(".stats")).toContainText("260");
    await expect(p.locator(".admin-main input")).toHaveCount(0);
  });
  await test("ADM-10 learning records and reader stay read-only with meanings, phrase, metadata and tags", async () => {
    await go("userdetail");
    await click("adm-user-tab:learning");
    await click("adm-reader:0");
    await expect(p.locator("#dialog")).toContainText("At home, she had woven");
    await expect(p.locator("#dialog")).toContainText("遇到困难后仍能继续调整");
    await expect(p.locator("#dialog")).toContainText("a ________ spirit");
    await expect(p.locator("#dialog")).toContainText("短文标签");
    await expect(p.locator("#dialog input,#dialog textarea")).toHaveCount(0);
    await expect(p.locator("#dialog [data-action]")).toHaveCount(2);
  });
  await test("ADM-11 growth tiers, bilingual content, titles, reward references and no initial-level reward", async () => {
    await go("operations");
    await click("optab:levelsettings");
    await expect(p.locator("#tier-points-0")).toBeDisabled();
    await p.fill("#tier-threshold-2", "50");
    await click("settings-save");
    await expect(p.locator("#admin-error")).toContainText("递增");
    await click("optab:achievementsettings");
    await click("tier-content:0");
    await p.fill("#tier-title-zh", "三日成就");
    await p.fill("#tier-honor-en", "Steady learner");
    await click("tier-content-save");
    await click("add-tier");
    await click("add-tier");
    await expect(p.locator("tbody tr")).toHaveCount(6);
    await p.fill("#tier-search", "三日成就");
    await expect(p.locator("tbody tr:visible")).toHaveCount(1);
    await p.fill("#tier-search", "");
    await click("optab:itemsettings");
    await click("item-refs:2");
    await expect(p.locator("#dialog")).toContainText("三日成就");
    await p.locator("#dialog button").filter({ hasText: "三日成就" }).click();
    await expect(p.locator("h1")).toHaveText("成长运营");
  });
  await test("ADM-12 presets retain all supported options and isolate unpublished draft from gallery", async () => {
    await go("presets");
    await expect(p.locator("#preset-style option")).toHaveCount(4);
    await expect(p.locator("#preset-length option")).toHaveCount(4);
    await expect(p.locator("#preset-language option")).toHaveCount(3);
    await p.fill("#preset-zh", "未发布的新标题");
    await click("preset-save");
    await demo("explore");
    await expect(p.locator("main")).not.toContainText("未发布的新标题");
    await demo("presets");
    await expect(p.locator("#preset-zh")).toHaveValue("未发布的新标题");
    await expect(p.locator('[data-action="preset-publish"]')).toBeEnabled();
    await click("preset-publish");
    await demo("explore");
    await expect(p.locator("main")).toContainText("未发布的新标题");
  });
  await test("ADM-13 new preset requires preview; changing params invalidates, failed preview keeps live", async () => {
    await go("presets");
    await click("new-preset");
    await p.fill("#preset-zh", "新预设");
    await p.fill("#preset-words", "resilient, wander, weave");
    await expect(p.locator('[data-action="preset-publish"]')).toBeDisabled();
    await click("preset-preview");
    await expect(p.locator('[data-action="preset-publish"]')).toBeEnabled();
    await p.selectOption("#preset-style", "Business");
    await expect(p.locator('[data-action="preset-publish"]')).toBeDisabled();
    await click("preset-preview");
    await expect(p.locator('[data-action="preset-publish"]')).toBeEnabled();
    await click("preset-publish");
    await click("preset-unlist");
    await click("preset-unlist-confirm");
    await demo("explore");
    await expect(p.locator("main")).not.toContainText("新预设");
    await go("presets", "&state=failure");
    await p.selectOption("#preset-style", "News");
    await click("preset-preview");
    await expect(p.locator("main")).toContainText("预览失败");
    await expect(p.locator('[data-action="preset-publish"]')).toBeDisabled();
  });
  await test("ADM-14 independent message list supports visibility, reminder and Markdown preview", async () => {
    await go("messages");
    await expect(p.locator(".admin-nav [aria-current]")).toContainText(
      "消息管理",
    );
    await p.fill("#body-zh", "## 提醒正文\n\n**测试** <img src=x>");
    await click("message-preview");
    await expect(p.locator("#dialog img")).toHaveCount(0);
    await click("close");
    await p.uncheck("#visible");
    await click("message-save");
    await expect(p.locator(".admin-record.selected")).toContainText("已隐藏");
    await demo("notices");
    await expect(p.locator(".notice-entry")).toHaveCount(1);
  });
  await test("ADM-15 analytics separates submitted success and excluded generation outcomes; mobile active module visible", async () => {
    await go("metrics");
    for (const text of [
      "复习成功率",
      "注册当日激活率",
      "主动取消（不计失败率）",
      "生成中（不计失败率）",
      "预检拒绝（不计失败率）",
    ])
      await expect(p.locator("main")).toContainText(text);
    for (const width of [320, 390]) {
      await p.setViewportSize({ width, height: 1000 });
      await go("metrics", "&lang=en");
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await go("messages");
      const bounds = await p.locator(".admin-nav [aria-current]").boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
  });
  const pages = [
    "adminhome",
    "metrics",
    "models",
    "plans",
    "users",
    "userdetail",
    "credits",
    "operations",
    "messages",
    "presets",
  ];
  for (const width of [390, 1440]) {
    await p.setViewportSize({ width, height: 1000 });
    for (const page of pages) {
      await go(page);
      await p.waitForTimeout(250);
      screens.push({
        page,
        width,
        overflow: await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      });
      await p.screenshot({
        path: path.join(__dirname, `UI05-${page}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await p.setViewportSize({ width: 1440, height: 1000 });
  for (const page of [
    "adminhome",
    "models",
    "plans",
    "users",
    "userdetail",
    "operations",
    "messages",
    "presets",
  ]) {
    await go(page);
    await p.locator("main").evaluate((el) =>
      Promise.all(
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.effect.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished),
      ),
    );
    const r = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    axe.push({
      page,
      violations: r.violations.map((x) => ({
        id: x.id,
        impact: x.impact,
        nodes: x.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
  }
  // Screens for the requested user management sections and growth configuration.
  for (const width of [1440, 390]) {
    await p.setViewportSize({ width, height: 1000 });
    await go("userdetail");
    for (const tab of ["points", "growth", "learning"]) {
      await click("adm-user-tab:" + tab);
      await p.waitForTimeout(250);
      await p.screenshot({
        path: path.join(__dirname, `UI05-user-${tab}-${width}.png`),
        fullPage: true,
      });
    }
  }
  const result = {
    version: "M002-UI-05",
    status:
      checks.some((c) => c.status === "FAIL") ||
      errors.length ||
      screens.some((s) => s.overflow) ||
      axe.some((x) => x.violations.length)
        ? "FAIL"
        : "PASS",
    checks,
    errors,
    screens,
    axe,
    browser: await browser.version(),
    scope:
      "Local UI prototype only; no backend security or transaction acceptance",
  };
  fs.writeFileSync(
    path.join(__dirname, "UI05-admin-results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        status: result.status,
        checks: checks.length,
        failures: checks.filter((x) => x.status === "FAIL"),
        errors,
        overflow: screens.filter((x) => x.overflow),
        axe: axe
          .filter((x) => x.violations.length)
          .map((x) => ({
            page: x.page,
            issues: x.violations.map((v) => v.id),
          })),
      },
      null,
      2,
    ),
  );
  await browser.close();
  process.exitCode = result.status === "PASS" ? 0 : 1;
})();
