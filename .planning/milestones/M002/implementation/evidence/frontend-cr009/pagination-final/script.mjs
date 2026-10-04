// Run from the product root against m002-local-stack.py and a production frontend on 3331.
// Supply a NEW evidence directory as argv[2]; no operational database or provider is used.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer, request as httpRequest } from "node:http";
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
});
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
  const stamp = Date.now();
  async function model(name) {
    return (
      await ok(admin, "/admin/models", "POST", {
        display_name: name + " " + stamp,
        description: null,
        openrouter_model_id: "local/" + randomUUID(),
      })
    ).model;
  }
  async function define(name, ids) {
    return (
      await ok(admin, "/admin/growth/items", "POST", {
        kind: "model_trial",
        name: { zh_CN: null, en_US: name + " " + stamp },
        description: { zh_CN: null, en_US: "Pagination regression" },
        exchange_price: "5",
        activation_ttl_seconds: 2592000,
        effect: {
          kind: "model_trial",
          model_ids: ids,
          trial_seconds: 259200,
          retirement_points: "20",
        },
      })
    ).item;
  }
  async function retire(m) {
    const impact = await ok(admin, "/admin/models/" + m.id + "/removal-impact");
    await ok(admin, "/admin/models/" + m.id, "DELETE", {
      expected_revision: impact.revision,
      confirmation_token: impact.confirmation_token,
      confirmed: true,
    });
  }
  const a = await model("First reference"),
    b = await model("Added reference");
  for (let i = 0; i < 22; i++) await model("Catalog filler " + i);
  const x = await model("Later retired reference");
  const single = await define("Later-only card", [x.id]),
    mixed = await define("Mixed-page card", [a.id, x.id]),
    failure = await define("Page retry card", [x.id]);
  await retire(x);
  // Leave another page beyond X to check that reference loading is bounded.
  for (let i = 0; i < 22; i++) await model("Far catalog " + i);
  const y = await model("Concurrent later reference");
  const ready = () => expect(select()).toBeEnabled();
  const price = () => dialog.getByLabel(t("retirementpoints"), { exact: true });
  const stored = async (item) =>
    (await ok(admin, "/admin/growth/items/" + item.id)).item;
  const ids = async (item) => (await stored(item)).effect.model_ids;
  const modelReads = [];
  page.on("request", (r) => {
    if (
      r.method() === "GET" &&
      new URL(r.url()).pathname === "/api/v1/admin/models"
    )
      modelReads.push(new URL(r.url()).search);
  });
  await check(
    "FE9-01",
    "Later-page sole reference is auto-loaded and price-only save retains it",
    async () => {
      await edit(single.name.en_US);
      await ready();
      expect(await selection()).toEqual([x.id]);
      await expect(select().locator(`option[value="${x.id}"]`)).toContainText(
        t("retired"),
      );
      await expect(select().locator(`option[value="${y.id}"]`)).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: t("a.more"), exact: true }),
      ).toBeVisible();
      await price().fill("31");
      await photo("later-reference-1440");
      await save();
      await expect(dialog).toHaveCount(0);
      expect(await ids(single)).toEqual([x.id]);
      expect((await stored(single)).effect.retirement_points).toBe("31");
    },
  );
  await check(
    "FE9-02",
    "Actual modifier-click adds a visible model without dropping the later-page reference",
    async () => {
      await edit(mixed.name.en_US);
      await ready();
      expect((await selection()).sort()).toEqual([a.id, x.id].sort());
      await select()
        .locator(`option[value="${b.id}"]`)
        .click({ modifiers: ["Meta"] });
      expect((await selection()).sort()).toEqual([a.id, b.id, x.id].sort());
      await save();
      await expect(dialog).toHaveCount(0);
      expect((await ids(mixed)).sort()).toEqual([a.id, b.id, x.id].sort());
    },
  );
  await check(
    "FE9-03",
    "Explicit removal persists and cannot newly add retired model on reopen or a new card",
    async () => {
      await edit(mixed.name.en_US);
      await ready();
      await select().selectOption([a.id, b.id]);
      await save();
      await expect(dialog).toHaveCount(0);
      expect((await ids(mixed)).sort()).toEqual([a.id, b.id].sort());
      await edit(mixed.name.en_US);
      await ready();
      await dialog
        .getByRole("button", { name: t("a.more"), exact: true })
        .click();
      await expect(select().locator(`option[value="${x.id}"]`)).toHaveCount(0);
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: t("newitem"), exact: true })
        .click();
      await expect(select().locator(`option[value="${x.id}"]`)).toHaveCount(0);
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "FE9-04",
    "Failed reference page blocks incomplete selection/save, retains input and retries on mobile",
    async () => {
      await page.setViewportSize({ width: 320, height: 760 });
      let block = true;
      const pattern = "**/api/v1/admin/models?*";
      await page.route(pattern, async (route) => {
        if (block && new URL(route.request().url()).searchParams.has("cursor"))
          await route.abort("failed");
        else await route.continue();
      });
      try {
        await edit(failure.name.en_US);
        await expect(dialog.locator(".app-error")).toBeVisible();
        await expect(select()).toBeDisabled();
        await expect(
          dialog.getByRole("button", { name: t("save"), exact: true }),
        ).toBeDisabled();
        await price().fill("48");
        const count = writes.length;
        await page.screenshot({
          path: join(out, "reference-load-failure-320.png"),
          fullPage: true,
        });
        expect(writes.length).toBe(count);
        expect((await stored(failure)).effect.retirement_points).toBe("20");
        expect(await ids(failure)).toEqual([x.id]);
        block = false;
        await dialog
          .getByRole("button", { name: t("retry"), exact: true })
          .click();
        await ready();
        expect(await selection()).toEqual([x.id]);
        await expect(price()).toHaveValue("48");
        await photo("later-reference-320");
        await save();
        await expect(dialog).toHaveCount(0);
        expect((await stored(failure)).effect.retirement_points).toBe("48");
        expect(await ids(failure)).toEqual([x.id]);
      } finally {
        await page.unroute(pattern);
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
    },
  );
  await check(
    "FE9-05",
    "Revision conflict loads newly referenced later-page retired models and waits for explicit retry",
    async () => {
      await edit(mixed.name.en_US);
      await ready();
      await price().fill("61");
      const current = await ok(admin, "/admin/growth/items/" + mixed.id);
      const updated = input(current.item, "77");
      updated.effect.model_ids = [a.id, b.id, y.id];
      await ok(admin, "/admin/growth/items/" + mixed.id, "PUT", {
        ...updated,
        expected_revision: current.revision,
      });
      await retire(y);
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "PUT" &&
          r.url().endsWith("/growth/items/" + mixed.id),
      );
      await save();
      expect((await response).status()).toBe(409);
      await expect(dialog.locator(".admin-facts")).toContainText("77");
      await expect(select().locator(`option[value="${y.id}"]`)).toContainText(
        t("retired"),
      );
      await ready();
      await expect(price()).toHaveValue("61");
      expect((await stored(mixed)).effect.retirement_points).toBe("77");
      expect((await selection()).sort()).toEqual([a.id, b.id].sort());
      const count = writes.length;
      await photo("conflict-later-reference");
      expect(writes.length).toBe(count);
      await save();
      await expect(dialog).toHaveCount(0);
      expect((await ids(mixed)).sort()).toEqual([a.id, b.id, y.id].sort());
      expect((await stored(mixed)).effect.retirement_points).toBe("61");
    },
  );
  writeFileSync(
    join(out, "model-reads.json"),
    JSON.stringify(modelReads, null, 2),
  );
} catch (error) {
  results.push({
    id: "setup",
    name: "fixture preparation",
    result: "FAIL",
    error: String(error),
  });
} finally {
  writeFileSync(
    join(out, "script.mjs"),
    readFileSync(new URL(import.meta.url)),
  );
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify(
      { results, pageErrors, writes, realProviderCalls: 0 },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, pageErrors }, null, 2));
  await browser.close();
  await new Promise((r) => proxy.close(r));
  if (results.some((r) => r.result === "FAIL") || pageErrors.length)
    process.exitCode = 1;
}
