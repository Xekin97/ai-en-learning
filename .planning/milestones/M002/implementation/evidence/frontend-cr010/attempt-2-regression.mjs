// Run from the product root with a disposable m002-local-stack and production frontend on 3331.
// The output directory must be new. Optional third argument "before" checks the old production build.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer, request as httpRequest } from "node:http";
import { execFileSync } from "node:child_process";
const require = createRequire(process.cwd() + "/frontend/package.json");
const { chromium, firefox, webkit, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
if (!process.argv[2]) throw Error("Supply a new evidence directory");
const out = resolve(process.argv[2]);
mkdirSync(out);
const before = process.argv[3] === "before";
const work = readFileSync("/tmp/wordweave-fe-m002-current", "utf8");
const env = JSON.parse(readFileSync(work + "/env.json"));
const origin = "http://127.0.0.1:3301";
if (
  !env.APP_DATABASE_URL.includes("63541/wordweave_fe_m002") ||
  env.OPENROUTER_BASE_URL !== "http://127.0.0.1:38082"
)
  throw Error("Disposable stack required");
const copy = JSON.parse(
  readFileSync(".planning/milestones/M002/design/copy.json"),
);
const t = (lang, key) =>
  copy.static[lang + "." + key] ?? copy.templates[lang + "." + key];
const dump = (name, value) =>
  writeFileSync(join(out, name), JSON.stringify(value, null, 2));
const sql = (query) =>
  execFileSync(
    "/opt/homebrew/opt/postgresql@18/bin/psql",
    [
      env.APP_DATABASE_URL,
      "-v",
      "ON_ERROR_STOP=1",
      "-X",
      "-A",
      "-t",
      "-c",
      query,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
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
async function call(context, path, method = "GET", data) {
  const headers = { origin, "sec-fetch-site": "same-origin" };
  if (method !== "GET")
    headers["x-csrf-token"] = (
      await (await context.request.get(origin + "/api/v1/bootstrap")).json()
    ).data.csrf_token;
  const r = await context.request.fetch(origin + "/api/v1" + path, {
    method,
    data,
    headers,
  });
  if (!r.ok()) throw Error(path + " " + r.status());
  return r.status() === 204 ? null : (await r.json()).data;
}
const ready = (p) =>
  p.waitForFunction(() => document.documentElement.dataset.appReady === "true");
const results = [],
  details = [],
  runtime = [],
  browsers = [];
let action = "setup";
async function check(id, fn) {
  action = id;
  try {
    await fn();
    results.push({ id, result: "PASS" });
  } catch (e) {
    results.push({ id, result: "FAIL", error: String(e) });
  }
  console.log(id, results.at(-1).result);
  dump("results.json", { results, realProviderCalls: 0 });
}
async function client(engine, name) {
  const browser = await engine.launch();
  browsers.push(browser);
  const context = await browser.newContext();
  await call(context, "/auth/login", "POST", {
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
    browser_ui_locale: "en-US",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) =>
    runtime.push({
      engine: name,
      action,
      url: page.url(),
      type: "pageerror",
      text: e.message,
    }),
  );
  page.on("console", (m) => {
    if (m.type() === "error" || /hydration/i.test(m.text()))
      runtime.push({
        engine: name,
        action,
        url: page.url(),
        type: m.type(),
        text: m.text(),
      });
  });
  return { context, page, name };
}
async function visit(c, width, lang) {
  const p = c.page;
  await p.setViewportSize({ width, height: 900 });
  await p.goto(origin + "/admin/analytics");
  await ready(p);
  if (
    !(await p
      .getByRole("button", { name: t(lang, "language"), exact: true })
      .count())
  ) {
    await p
      .getByRole("button", {
        name: t(lang === "en" ? "zh" : "en", "language"),
        exact: true,
      })
      .click();
    await expect(p.locator("h1")).toHaveText(t(lang, "metrics.title"));
  }
  await expect(p.locator("select")).toBeEnabled();
}
async function inspect(c, width, lang, period, state) {
  const p = c.page;
  if (period === 30) {
    await Promise.all([
      p.waitForResponse(
        (r) =>
          r.url().includes("/admin/analytics/traffic?") && r.status() === 200,
      ),
      p
        .getByRole("combobox", { name: t(lang, "period"), exact: true })
        .selectOption("30"),
    ]);
    await expect(p.locator("select")).toBeEnabled();
  }
  const day = (await call(c.context, "/admin/overview")).learning_day;
  const start = new Date(day + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - period + 1);
  const traffic = await call(
    c.context,
    "/admin/analytics/traffic?start_day=" +
      start.toISOString().slice(0, 10) +
      "&end_day=" +
      day,
  );
  await expect(p.locator(".chart > .bar")).toHaveCount(period);
  expect(
    await p
      .locator(".chart > .bar")
      .evaluateAll((es) => es.map((e) => e.title.split(" · ")[0])),
  ).toEqual(traffic.series.map((x) => x.day));
  const geometry = await p.evaluate(() => {
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, height: r.height };
    };
    const chart = document.querySelector(".chart");
    return {
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      chart: rect(chart),
      panels: [...document.querySelectorAll(".split > .panel")].map(rect),
      bars: [...chart.children].map(rect),
      labels: [...chart.querySelectorAll("span")]
        .filter((e) => getComputedStyle(e).display !== "none")
        .map((e) => ({ text: e.textContent, ...rect(e) })),
    };
  });
  details.push({
    id: action,
    engine: c.name,
    lang,
    period,
    state,
    geometry,
    series: traffic.series,
  });
  await p.locator(".split").screenshot({ path: join(out, action + ".png") });
  expect(geometry.document).toBeLessThanOrEqual(width);
  if (width > 760)
    expect(
      Math.abs(geometry.panels[0].width - geometry.panels[1].width),
    ).toBeLessThan(2);
  for (const bar of geometry.bars) {
    expect(bar.width).toBeGreaterThan(0);
    expect(bar.x).toBeGreaterThanOrEqual(geometry.chart.x - 1);
    expect(bar.right).toBeLessThanOrEqual(geometry.chart.right + 1);
  }
  for (let i = 0; i < geometry.labels.length; i++) {
    const label = geometry.labels[i];
    expect(label.x).toBeGreaterThanOrEqual(geometry.chart.x - 1);
    expect(label.right).toBeLessThanOrEqual(geometry.chart.right + 1);
    if (i)
      expect(label.x).toBeGreaterThanOrEqual(geometry.labels[i - 1].right + 1);
  }
  expect(geometry.labels[0].text).toBe(traffic.series[0].day.slice(5));
  expect(geometry.labels.at(-1).text).toBe(traffic.series.at(-1).day.slice(5));
  const section = p.locator(".split > .panel").first(),
    table = section.locator("details");
  await table.locator("summary").focus();
  await p.keyboard.press("Enter");
  await expect(table).toHaveAttribute("open", "");
  await expect(table.locator("tbody tr")).toHaveCount(period);
  const rendered = await table
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => [...row.cells].map((cell) => cell.textContent.trim())),
    );
  const present = (m) =>
    m.status === "ready" && m.value !== null
      ? String(m.value)
      : t(
          lang,
          m.status === "no_sample"
            ? "nosample"
            : m.status === "observing"
              ? "observing"
              : "unknown",
        );
  expect(rendered.map((r) => r.slice(0, 3))).toEqual(
    traffic.series.map((x) => [x.day, present(x.pv), present(x.uv)]),
  );
  await table.locator(".table-wrap").focus();
  await expect(table.locator(".table-wrap")).toBeFocused();
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
  await table.locator("summary").click();
  if (state === "populated") {
    expect(traffic.series.every((r) => (r.pv.value ?? 0) > 0)).toBe(true);
    await expect(p.locator(".split")).toContainText(t(lang, "nosample"));
    await expect(
      p.locator(".data-table").filter({ hasText: "D30" }),
    ).toContainText(t(lang, "observing"));
  }
}
try {
  const main = await client(chromium, "chromium");
  if (before) {
    await visit(main, 320, "en");
    await check("FE10-BEFORE", () => inspect(main, 320, "en", 30, "empty"));
  } else {
    const prototype = await main.context.newPage();
    for (const width of [320, 1440]) {
      await prototype.setViewportSize({ width, height: 900 });
      await prototype.goto(
        "http://127.0.0.1:4186/prototype/?page=metrics&lang=en",
      );
      await expect(prototype.locator(".chart")).toBeVisible();
      await prototype
        .locator(".split")
        .screenshot({ path: join(out, "prototype-" + width + ".png") });
    }
    await prototype.close();
    for (const lang of ["en", "zh"]) {
      await visit(main, 320, lang);
      await check("FE10-empty-" + lang + "-7", () =>
        inspect(main, 320, lang, 7, "empty"),
      );
      await check("FE10-empty-" + lang + "-30", () =>
        inspect(main, 320, lang, 30, "empty"),
      );
    }
    // Historical page-view fixtures exercise full daily arrays, not external analytics or provider calls.
    sql(
      "UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '60 days'; INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0) ON CONFLICT (level_no) DO NOTHING",
    );
    const learner = await main.context.browser().newContext();
    await call(learner, "/auth/register", "POST", {
      username: "fe10_" + Date.now(),
      password: env.ADMIN_PASSWORD,
      password_confirmation: env.ADMIN_PASSWORD,
      ui_locale: "en-US",
    });
    await learner.close();
    sql(
      "INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,learning_day,browser_key_hash,event_outcome,source_kind) SELECT 'fe10:'||d::text||':'||n,'page_view',(d::timestamp+interval '4 hours') AT TIME ZONE 'Asia/Shanghai',d,decode(repeat('ab',32),'hex'),'anonymous','browser' FROM generate_series(((clock_timestamp() AT TIME ZONE 'Asia/Shanghai'-interval '4 hours')::date-29)::timestamp,(clock_timestamp() AT TIME ZONE 'Asia/Shanghai'-interval '4 hours')::date::timestamp,interval '1 day') x(d) CROSS JOIN LATERAL generate_series(1,1+(extract(day FROM d)::int%5)) y(n)",
    );
    await expect
      .poll(
        () =>
          Number(
            sql(
              "SELECT coalesce(value,0) FROM wordweave.analytics_daily WHERE day=(clock_timestamp() AT TIME ZONE 'Asia/Shanghai'-interval '4 hours')::date AND metric='pv' AND dimension_key='all'",
            ),
          ),
        { timeout: 75000, intervals: [1000, 2000, 5000] },
      )
      .toBeGreaterThan(0);
    for (const lang of ["en", "zh"])
      for (const width of [320, 390, 1280, 1440]) {
        await visit(main, width, lang);
        for (const period of [7, 30])
          await check(`FE10-chromium-${lang}-${width}-${period}`, () =>
            inspect(main, width, lang, period, "populated"),
          );
      }
    for (const [engine, name] of [
      [firefox, "firefox"],
      [webkit, "webkit"],
    ]) {
      const c = await client(engine, name);
      for (const [width, lang] of [
        [320, "en"],
        [1440, "zh"],
      ]) {
        await visit(c, width, lang);
        await check(`FE10-${name}-${lang}-${width}-30`, () =>
          inspect(c, width, lang, 30, "populated"),
        );
      }
    }
    await check("FE10-accessibility", async () => {
      await visit(main, 320, "en");
      await main.page
        .getByRole("combobox", { name: t("en", "period"), exact: true })
        .selectOption("30");
      await expect(main.page.locator(".chart > .bar")).toHaveCount(30);
      const scan = await new AxeBuilder({ page: main.page })
        .include(".split")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      dump("axe.json", {
        violations: scan.violations,
        passes: scan.passes.map((p) => p.id),
      });
      expect(scan.violations).toEqual([]);
    });
    await check("FE10-runtime", async () => {
      expect(runtime).toEqual([]);
    });
  }
} catch (e) {
  results.push({ id: "setup", result: "FAIL", error: String(e) });
  console.log(String(e));
} finally {
  dump("details.json", { details, runtime });
  dump("results.json", { results, realProviderCalls: 0 });
  console.log(JSON.stringify(results, null, 2));
  for (const browser of browsers) await browser.close();
  await new Promise((r) => proxy.close(r));
  if (results.some((r) => r.result === "FAIL")) process.exitCode = 1;
}
