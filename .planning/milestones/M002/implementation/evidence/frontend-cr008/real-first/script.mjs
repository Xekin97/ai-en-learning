// Run from the product root against m002-local-stack.py and a production frontend on 3331.
// Supply a NEW evidence directory as argv[2]; no operational database or provider is used.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer, request as httpRequest } from "node:http";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const { chromium, expect } = createRequire(
  process.cwd() + "/frontend/package.json",
)("@playwright/test");
if (!process.argv[2]) throw Error("Supply a new evidence directory");
const out = resolve(process.argv[2]);
mkdirSync(out);
const work = readFileSync("/tmp/wordweave-fe-m002-current", "utf8");
const env = JSON.parse(readFileSync(work + "/env.json"));
const origin = "http://127.0.0.1:3301";
if (
  env.PUBLIC_ORIGIN !== origin ||
  !env.APP_DATABASE_URL.includes("63541/wordweave_fe_m002") ||
  env.OPENROUTER_BASE_URL !== "http://127.0.0.1:38082"
)
  throw Error("Disposable stack required");
const copy = JSON.parse(
  readFileSync(".planning/milestones/M002/design/copy.json"),
);
const t = (key) => copy.static["en." + key] ?? copy.templates["en." + key];
const results = [],
  pageErrors = [],
  writes = [];
const proxy = createServer((req, res) => {
  const up = httpRequest(
    {
      hostname: "127.0.0.1",
      port: req.url.startsWith("/api/v1") ? 38081 : 3331,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        "x-forwarded-host": "127.0.0.1:3301",
        "x-forwarded-proto": "http",
      },
    },
    (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    },
  );
  up.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(up);
});
await new Promise((r) => proxy.listen(3301, "127.0.0.1", r));
const browser = await chromium.launch();
const admin = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  user = await browser.newContext();
const page = await admin.newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("request", (r) => {
  if (
    ["PUT", "POST"].includes(r.method()) &&
    /\/admin\/growth\/items(?:\/[^/]+)?$/.test(new URL(r.url()).pathname)
  )
    writes.push({ method: r.method(), body: r.postDataJSON() });
});
async function call(context, path, method = "GET", data, idem) {
  const headers = { origin, "sec-fetch-site": "same-origin" };
  if (method !== "GET") {
    headers["x-csrf-token"] = (
      await (await context.request.get(origin + "/api/v1/bootstrap")).json()
    ).data.csrf_token;
    if (idem) headers["Idempotency-Key"] = idem;
  }
  const r = await context.request.fetch(origin + "/api/v1" + path, {
    method,
    data,
    headers,
  });
  return {
    status: r.status(),
    body: r.status() === 204 ? null : await r.json(),
  };
}
async function ok(...args) {
  const r = await call(...args);
  if (r.status < 200 || r.status >= 300)
    throw Error(args[1] + " " + r.status + " " + JSON.stringify(r.body));
  return r.body?.data;
}
async function check(id, name, fn) {
  try {
    await fn();
    results.push({ id, name, result: "PASS" });
  } catch (e) {
    results.push({ id, name, result: "FAIL", error: String(e) });
  }
  console.log(id, results.at(-1).result);
}
const dialog = page.locator("dialog[open]");
const select = () =>
  dialog.getByRole("listbox", { name: t("model"), exact: true });
const save = () =>
  dialog.getByRole("button", { name: t("save"), exact: true }).click();
async function edit(name) {
  await page.goto(origin + "/admin/growth");
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
  await page
    .locator("tr")
    .filter({ hasText: name })
    .getByRole("button", { name: t("edit"), exact: true })
    .click();
}
async function selection() {
  return select().evaluate((el) =>
    Array.from(el.selectedOptions, (o) => o.value),
  );
}
async function photo(name) {
  await select().scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  const geometry = await dialog.evaluate((el) => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    dialogWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.dialogWidth + 1);
  await page.screenshot({ path: join(out, name + ".png"), fullPage: true });
  writeFileSync(
    join(out, name + ".json"),
    JSON.stringify(
      {
        geometry,
        options: await select()
          .locator("option")
          .evaluateAll((options) =>
            options.map((o) => ({
              text: o.textContent.trim(),
              value: o.value,
              selected: o.selected,
            })),
          ),
      },
      null,
      2,
    ),
  );
}
function input(item, points) {
  return {
    kind: item.kind,
    name: item.name,
    description: item.description,
    exchange_price: item.exchange_price,
    activation_ttl_seconds: item.activation_ttl_seconds,
    effect: { ...item.effect, retirement_points: points },
  };
}
try {
  await ok(admin, "/auth/login", "POST", {
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
    browser_ui_locale: "en-US",
  });
  const levels = await ok(admin, "/admin/growth/levels");
  if (!levels.items.length) {
    const value = {
      expected_revision: levels.revision,
      changes: [
        {
          client_key: randomUUID(),
          id: null,
          value: {
            level_number: 1,
            min_experience: "0",
            reward_enabled: false,
            reward: { points: "0", item_definition_id: null, item_count: 0 },
          },
        },
      ],
    };
    const preview = await ok(
      admin,
      "/admin/growth/levels/impact-preview",
      "POST",
      value,
    );
    await ok(admin, "/admin/growth/levels", "PUT", {
      ...value,
      confirmation_token: preview.confirmation_token,
      confirmed: true,
    });
    execFileSync(
      "/opt/homebrew/opt/postgresql@18/bin/psql",
      [
        env.APP_DATABASE_URL,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience) VALUES(CURRENT_DATE-1,1,1,7,1) ON CONFLICT(effective_day) DO NOTHING",
      ],
      { stdio: "pipe" },
    );
    execFileSync(
      work + "/wordweave-admin",
      [
        "activate-growth",
        "--database",
        "wordweave_fe_m002",
        "--role",
        "fe_test",
        "--confirm",
      ],
      {
        env: { ...env, MAINTENANCE_DATABASE_URL: env.APP_DATABASE_URL },
        stdio: "pipe",
      },
    );
  }
  const actor = await ok(user, "/auth/register", "POST", {
    username: "cr008_" + Date.now(),
    password: env.ADMIN_PASSWORD,
    password_confirmation: env.ADMIN_PASSWORD,
    ui_locale: "en-US",
  });
  await ok(
    admin,
    "/admin/users/" + actor.actor.id + "/point-grants",
    "POST",
    { points: "200", reason: "Isolated regression fixture" },
    randomUUID(),
  );
  async function model(name) {
    return (
      await ok(admin, "/admin/models", "POST", {
        display_name: name,
        description: null,
        openrouter_model_id: "local/" + randomUUID(),
      })
    ).model;
  }
  const a = await model("Retired reference"),
    b = await model("Available reference"),
    unrelated = await model("Other retired reference");
  async function define(name, ids) {
    const r = await ok(admin, "/admin/growth/items", "POST", {
      kind: "model_trial",
      name: { zh_CN: null, en_US: name },
      description: { zh_CN: null, en_US: "Isolated regression" },
      exchange_price: "5",
      activation_ttl_seconds: 2592000,
      effect: {
        kind: "model_trial",
        model_ids: ids,
        trial_seconds: 259200,
        retirement_points: "20",
      },
    });
    return (
      await ok(admin, "/admin/growth/items/" + r.item.id + "/listing", "PUT", {
        listed: true,
        expected_revision: r.revision,
      })
    ).item;
  }
  const single = await define("Single retained card", [a.id]),
    mixed = await define("Mixed retained card", [a.id, b.id]);
  const card = (
    await ok(
      user,
      "/shop/exchanges",
      "POST",
      { definition_id: single.id, quantity: 1 },
      randomUUID(),
    )
  ).receipt.items[0].item_id;
  for (const m of [a, unrelated]) {
    const impact = await ok(admin, "/admin/models/" + m.id + "/removal-impact");
    await ok(admin, "/admin/models/" + m.id, "DELETE", {
      expected_revision: impact.revision,
      confirmation_token: impact.confirmation_token,
      confirmed: true,
    });
  }
  const oldPreview = await ok(
    user,
    "/me/items/" + card + "/refund-preview",
    "POST",
    {},
  );
  expect(oldPreview.points).toBe("20");
  await check(
    "FE8-01",
    "Real editor preserves a retired reference and persists 20 -> 35",
    async () => {
      await edit(single.name.en_US);
      expect(await selection()).toEqual([a.id]);
      await expect(select().locator(`option[value="${a.id}"]`)).toContainText(
        t("retired"),
      );
      await expect(
        select().locator(`option[value="${unrelated.id}"]`),
      ).toHaveCount(0);
      await dialog
        .getByLabel(t("retirementpoints"), { exact: true })
        .fill("35");
      await photo("retired-editor-1440");
      const count = writes.length;
      await save();
      await expect(dialog).toHaveCount(0);
      expect(writes.length).toBe(count + 1);
      expect(writes.at(-1).body.effect).toEqual({
        ...single.effect,
        retirement_points: "35",
      });
      const stored = await ok(admin, "/admin/growth/items/" + single.id);
      expect(stored.item.effect).toEqual({
        ...single.effect,
        retirement_points: "35",
      });
      await edit(single.name.en_US);
      await expect(
        dialog.getByLabel(t("retirementpoints"), { exact: true }),
      ).toHaveValue("35");
      expect(await selection()).toEqual([a.id]);
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "FE8-02",
    "UI price change invalidates old preview; latest refund settles exactly once",
    async () => {
      const stale = await call(
        user,
        "/me/items/" + card + "/retirement-refund",
        "POST",
        { confirmation_token: oldPreview.confirmation_token },
        randomUUID(),
      );
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("preview_stale");
      const fresh = await ok(
        user,
        "/me/items/" + card + "/refund-preview",
        "POST",
        {},
      );
      expect(fresh.points).toBe("35");
      const key = randomUUID(),
        body = { confirmation_token: fresh.confirmation_token };
      const refund = await ok(
        user,
        "/me/items/" + card + "/retirement-refund",
        "POST",
        body,
        key,
      );
      const repeat = await ok(
        user,
        "/me/items/" + card + "/retirement-refund",
        "POST",
        body,
        key,
      );
      expect(refund.receipt.points_delta).toBe("35");
      expect(repeat.receipt.id).toBe(refund.receipt.id);
      expect((await ok(user, "/me/growth")).points).toBe("230");
    },
  );
  await check(
    "FE8-03",
    "Mixed card retains both references and saves on a 320px viewport",
    async () => {
      await page.setViewportSize({ width: 320, height: 760 });
      await edit(mixed.name.en_US);
      expect((await selection()).sort()).toEqual([a.id, b.id].sort());
      await dialog
        .getByLabel(t("retirementpoints"), { exact: true })
        .fill("45");
      await photo("mixed-editor-320");
      await save();
      await expect(dialog).toHaveCount(0);
      expect(
        (await ok(admin, "/admin/growth/items/" + mixed.id)).item.effect,
      ).toEqual({ ...mixed.effect, retirement_points: "45" });
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  await check(
    "FE8-04",
    "New cards exclude every retired reference and cannot save an empty selection",
    async () => {
      await page
        .getByRole("button", { name: t("newitem"), exact: true })
        .click();
      expect(
        await select()
          .locator("option")
          .evaluateAll((options) => options.map((o) => o.value)),
      ).toEqual([b.id]);
      await dialog
        .getByLabel(t("name.en"), { exact: true })
        .fill("New valid card");
      await dialog.getByLabel(t("price"), { exact: true }).fill("5");
      await dialog.getByLabel(t("deadline"), { exact: true }).fill("30");
      await dialog.getByLabel(t("duration"), { exact: true }).fill("3");
      await dialog
        .getByLabel(t("retirementpoints"), { exact: true })
        .fill("10");
      const count = writes.length;
      await save();
      expect(await select().evaluate((el) => el.validity.valueMissing)).toBe(
        true,
      );
      expect(writes.length).toBe(count);
      await select().selectOption(b.id);
      await save();
      await expect(dialog).toHaveCount(0);
      expect(writes.length).toBe(count + 1);
      expect(writes.at(-1).body.effect.model_ids).toEqual([b.id]);
      expect(writes.at(-1).body.effect).not.toHaveProperty("extra_count");
    },
  );
  await check(
    "FE8-05",
    "Clearing existing model selection is still blocked by native validation",
    async () => {
      await edit(single.name.en_US);
      await select().selectOption([]);
      const count = writes.length;
      await save();
      expect(await select().evaluate((el) => el.validity.valueMissing)).toBe(
        true,
      );
      expect(writes.length).toBe(count);
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "FE8-06",
    "Revision conflict keeps the draft and retained references for explicit retry",
    async () => {
      await edit(mixed.name.en_US);
      await dialog
        .getByLabel(t("retirementpoints"), { exact: true })
        .fill("55");
      const current = await ok(admin, "/admin/growth/items/" + mixed.id);
      await ok(admin, "/admin/growth/items/" + mixed.id, "PUT", {
        ...input(current.item, "70"),
        expected_revision: current.revision,
      });
      const failed = page.waitForResponse(
        (r) =>
          r.request().method() === "PUT" &&
          r.url().endsWith("/growth/items/" + mixed.id),
      );
      await save();
      expect((await failed).status()).toBe(409);
      await expect(dialog.locator(".notice.warn")).toBeVisible();
      await expect(
        dialog.getByLabel(t("retirementpoints"), { exact: true }),
      ).toHaveValue("55");
      expect(
        (await ok(admin, "/admin/growth/items/" + mixed.id)).item.effect
          .retirement_points,
      ).toBe("70");
      await save();
      await expect(dialog).toHaveCount(0);
      expect(
        (await ok(admin, "/admin/growth/items/" + mixed.id)).item.effect,
      ).toEqual({ ...mixed.effect, retirement_points: "55" });
    },
  );
  await check(
    "FE8-07",
    "A retired reference removed by saving cannot be newly added again",
    async () => {
      await edit(mixed.name.en_US);
      await select().selectOption(b.id);
      await save();
      await expect(dialog).toHaveCount(0);
      await edit(mixed.name.en_US);
      expect(await selection()).toEqual([b.id]);
      await expect(select().locator(`option[value="${a.id}"]`)).toHaveCount(0);
      await page.keyboard.press("Escape");
      const denied = await call(
        admin,
        "/admin/growth/items",
        "POST",
        input(single, "1"),
      );
      expect(denied.status).toBe(422);
    },
  );
  expect(pageErrors).toEqual([]);
} catch (e) {
  results.push({ id: "setup-or-runtime", result: "FAIL", error: String(e) });
} finally {
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify(
      { results, pageErrors, writes, realProviderCalls: 0 },
      null,
      2,
    ),
  );
  await page
    .screenshot({ path: join(out, "final.png"), fullPage: true })
    .catch(() => {});
  await browser.close();
  await new Promise((r) => proxy.close(r));
  if (results.some((r) => r.result === "FAIL")) process.exitCode = 1;
}
