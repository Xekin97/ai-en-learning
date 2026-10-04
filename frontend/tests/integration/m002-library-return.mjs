// Run from the product root against m002-local-stack and production Nuxt on 3331.
// Use a new output directory; optional arguments: before|after, existing fixture.json.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer, request as httpRequest } from "node:http";
import { execFileSync } from "node:child_process";
const require = createRequire(process.cwd() + "/frontend/package.json");
const { chromium, firefox, webkit, expect } = require("@playwright/test");
const out = resolve(process.argv[2]);
mkdirSync(out);
const before = process.argv[3] === "before";
const selected = process.env.CR012_CASES?.split(",");
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
async function call(c, path, method = "GET", data, extra = {}) {
  const headers = { origin, "sec-fetch-site": "same-origin", ...extra };
  if (method !== "GET")
    headers["x-csrf-token"] = (
      await (await c.request.get(origin + "/api/v1/bootstrap")).json()
    ).data.csrf_token;
  return c.request.fetch(origin + "/api/v1" + path, { method, data, headers });
}
async function ok(...args) {
  const r = await call(...args);
  if (!r.ok()) throw Error(args[1] + " " + r.status() + " " + (await r.text()));
  return r.status() === 204 ? null : (await r.json()).data;
}
const login = (c, username) =>
  ok(c, "/auth/login", "POST", {
    username,
    password: env.ADMIN_PASSWORD,
    browser_ui_locale: "en-US",
  });
const locale = (c, lang) =>
  ok(c, "/me/ui-locale", "PUT", {
    ui_locale: lang === "zh" ? "zh-CN" : "en-US",
  });
const ready = (p) =>
  p.waitForFunction(() => document.documentElement.dataset.appReady === "true");
const results = [],
  details = [],
  runtime = [];
let calls = 0,
  fixture,
  action = "SETUP";
const passage =
  "A thoughtful student learns(learn) by building a steady learning(learn) routine through daily reading and discussion. Each morning the student reviews a few ideas, connects them with practical examples, and writes a short reflection. Friends later compare their observations, ask clear questions, and share useful explanations about what they learned(learn). This patient practice makes new knowledge easier to remember and apply with confidence. A favorite book(book) provides fresh examples to read(read) together after class.";
const provider = createServer(async (req, res) => {
  if (req.url === "/models") {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        data: [
          {
            id: "provider/integration",
            supported_parameters: ["structured_outputs"],
          },
        ],
      }),
    );
    return;
  }
  if (req.url !== "/chat/completions") {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = "";
  for await (const c of req) body += c;
  calls++;
  const probe = JSON.parse(body).messages.some((m) =>
    m.content.includes("fixed compatibility probe"),
  );
  const targets = {
    learn: {
      entry_meaning: "gain knowledge through study",
      hint_phrase:
        "learning(learn) through learned(learn) examples while learning(learn)",
    },
    book: {
      entry_meaning: "a collection of written pages",
      hint_phrase: "a useful book(book)",
    },
    read: {
      entry_meaning: "understand written words",
      hint_phrase: "read(read) a story",
    },
  };
  if (probe) {
    delete targets.book;
    delete targets.read;
    targets.vulnerable = {
      entry_meaning: "open to harm",
      hint_phrase: "vulnerable(vulnerable) communities",
    };
  }
  const content = {
    passage: probe
      ? passage.replace("book(book)", "book").replace("read(read)", "read") +
        " The group also discussed vulnerability(vulnerable) with empathy."
      : passage,
    tags: ["study"],
    targets,
  };
  res.setHeader("content-type", "text/event-stream");
  res.end(
    "data: " +
      JSON.stringify({
        choices: [{ delta: { content: JSON.stringify(content) } }],
      }) +
      "\n\ndata: [DONE]\n\n",
  );
});
async function seed(browser) {
  const admin = await browser.newContext(),
    user = await browser.newContext();
  try {
    await login(admin, env.ADMIN_USERNAME);
    const connections = await ok(admin, "/admin/model-connections");
    const current = await ok(admin, "/admin/models");
    const m = await ok(admin, "/admin/models", "POST", {
      display_name: "CR012 local fixture",
      description: "Disposable provider",
      provider_model_id: "provider/integration",
      expected_revision: current.revision,
      output_mode: "json_schema",
      enabled: false,
      connection: {
        name: "Local integration",
        protocol: "openai_chat",
        base_url: connections.items[0].base_url,
        api_key: "cr012-local-only-key",
      },
    });
    await ok(admin, "/admin/models/" + m.model.id + "/enable", "POST", {
      expected_revision: m.revision,
    });
    const g = await ok(admin, "/admin/groups"),
      b = g.items.find((x) => x.code === "basic");
    await ok(admin, "/admin/groups/basic", "PUT", {
      expected_revision: g.revision,
      priority: b.priority,
      max_entries: 5,
      rolling_24h_limit: 50,
      model_ids: [m.model.id],
      allowed_lengths: ["short"],
    });
    sql(
      "UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '60 days'; INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0) ON CONFLICT(level_no) DO NOTHING; INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience) VALUES(CURRENT_DATE-60,1,1,7,1) ON CONFLICT(effective_day) DO NOTHING",
    );
    const username = "cr012_" + Date.now();
    const actor = (
      await ok(user, "/auth/register", "POST", {
        username,
        password: env.ADMIN_PASSWORD,
        password_confirmation: env.ADMIN_PASSWORD,
        ui_locale: "en-US",
      })
    ).actor;
    const ids = [];
    for (let i = 0; i < 21; i++) {
      const r = await call(user, "/generations/stream", "POST", {
        model_id: m.model.id,
        meaning_language: "en",
        scenario: "story",
        length: "short",
        entries: ["learn", "book", "read"],
      });
      expect(r.status()).toBe(200);
      const events = (await r.text())
        .split("\n\n")
        .filter((x) => x.startsWith("event:"))
        .map((x) => {
          const lines = x.split("\n");
          return {
            event: lines[0].slice(7),
            data: JSON.parse(lines.find((x) => x.startsWith("data:")).slice(6)),
          };
        });
      expect(
        events
          .filter((x) =>
            /^generation\.(validated|failed|cancelled)$/.test(x.event),
          )
          .map((x) => x.event),
      ).toEqual(["generation.validated"]);
      const started = events.find((x) => x.event === "generation.started").data;
      ids.push(
        (
          await ok(
            user,
            "/generations/" + started.run_id + "/save",
            "POST",
            {},
            { "X-Generation-Token": started.generation_token },
          )
        ).batch_id,
      );
    }
    const batch = (await ok(user, "/me/batches/" + ids.at(-1))).batch;
    const title =
      "A patient reader keeps learning through everyday stories, shared books, and thoughtful reflections";
    await ok(user, "/me/batches/" + ids.at(-1), "PATCH", {
      title,
      expected_title_revision: batch.title_revision,
    });
    return {
      username,
      userId: actor.id,
      ids,
      title,
      entries: ["learn", "book", "read"],
    };
  } finally {
    await admin.close();
    await user.close();
  }
}
function instrument(p) {
  p.setDefaultTimeout(12000);
  p.on("pageerror", (e) =>
    runtime.push({ action, kind: "pageerror", text: e.message }),
  );
  p.on("console", (m) => {
    if (["warning", "error"].includes(m.type()))
      runtime.push({ action, kind: m.type(), text: m.text() });
  });
}
async function test(id, fn, page) {
  if (selected && !selected.includes(id)) return;
  action = id;
  try {
    await fn();
    results.push({ id, result: "PASS" });
  } catch (e) {
    results.push({ id, result: "FAIL", error: String(e) });
    if (page)
      await page
        .screenshot({ path: join(out, id + "-failure.png") })
        .catch(() => {});
  }
  dump("results.json", {
    results,
    runtime,
    localProviderCalls: calls,
    realProviderCalls: 0,
  });
  console.log(id, results.at(-1).result);
}
async function list(p, lang, query = "LEARN") {
  await p.goto(origin + "/library");
  await ready(p);
  await p.getByRole("searchbox").fill(query);
  await p
    .getByRole("button", { name: t(lang, "l.searchAction"), exact: true })
    .click();
  await expect(p.locator(".library-row")).toHaveCount(20);
  await p.getByRole("button", { name: t(lang, "l.more"), exact: true }).click();
  await expect(p.locator(".library-row")).toHaveCount(21);
}
async function geometry(p, id) {
  return p.evaluate((id) => {
    const el = document.querySelector('[data-batch="' + id + '"] h2 a'),
      box = el?.getBoundingClientRect();
    return {
      y: scrollY,
      top: box?.top,
      bottom: box?.bottom,
      focused: document.activeElement === el,
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      height: innerHeight,
      count: document.querySelectorAll(".library-row").length,
    };
  }, id);
}
async function roundTrip(p, lang, mode, entry = "title", query = "LEARN") {
  await list(p, lang, query);
  const id = fixture.ids.at(-1),
    row = p.locator('[data-batch="' + id + '"]');
  const link =
    entry === "title"
      ? row.locator("h2 a")
      : row.getByRole("link", { name: t(lang, "l.detail"), exact: true });
  await link.scrollIntoViewIfNeeded();
  await p.evaluate(() => document.fonts.ready);
  const first = await geometry(p, id);
  expect(first.y).toBeGreaterThan(0);
  if (mode === "keyboard") {
    await link.focus();
    await p.keyboard.press("Enter");
  } else await link.click();
  await expect(p).toHaveURL(new RegExp("/library/" + id));
  await expect(p.locator(".batch-title")).toHaveText(fixture.title);
  if (mode === "history") await p.goBack();
  else
    await p
      .getByRole("link", { name: t(lang, "l.backLibrary"), exact: true })
      .click();
  await expect(p.locator(".library-row")).toHaveCount(21);
  // Observe after Nuxt's deferred scrolling, rather than accepting an intermediate frame.
  await p.waitForTimeout(700);
  const last = await geometry(p, id);
  details.push({
    action,
    lang,
    mode,
    entry,
    query,
    before: first,
    after: last,
  });
  await p.screenshot({ path: join(out, action + ".png") });
  await expect(p.getByRole("searchbox")).toHaveValue(query);
  expect(
    await p
      .locator(".library-row")
      .evaluateAll((rows) => rows.map((r) => r.dataset.batch)),
  ).toEqual(fixture.ids);
  expect(Math.abs(first.y - last.y)).toBeLessThan(3);
  expect(last.focused).toBe(true);
  expect(last.top).toBeLessThan(last.height);
  expect(last.bottom).toBeGreaterThan(0);
  expect(last.width).toBeLessThanOrEqual(last.viewport);
}
await new Promise((r) => proxy.listen(3301, "127.0.0.1", r));
let providerStarted = false;
const browsers = [];
try {
  const browser = await chromium.launch();
  browsers.push(browser);
  if (process.argv[4]) fixture = JSON.parse(readFileSync(process.argv[4]));
  else {
    await new Promise((r) => provider.listen(38082, "127.0.0.1", r));
    providerStarted = true;
    fixture = await seed(browser);
  }
  dump("fixture.json", fixture);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await login(context, fixture.username);
  const page = await context.newPage();
  instrument(page);
  if (before) {
    await test(
      "before-explicit",
      () => roundTrip(page, "en", "explicit"),
      page,
    );
    await test("before-history", () => roundTrip(page, "en", "history"), page);
  } else {
    const proto = await browser.newPage();
    for (const width of [320, 1440]) {
      await proto.setViewportSize({ width, height: 900 });
      await proto.goto("http://127.0.0.1:4186/prototype/?page=library&lang=en");
      await proto.waitForTimeout(350);
      await proto.screenshot({
        path: join(out, "prototype-" + width + ".png"),
      });
    }
    await proto.close();
    for (const lang of ["en", "zh"]) {
      await locale(context, lang);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const mode of ["explicit", "history"])
          await test(
            "chromium-" + lang + "-" + width + "-" + mode,
            () => roundTrip(page, lang, mode),
            page,
          );
      }
    }
    for (const [name, engine] of [
      ["firefox", firefox],
      ["webkit", webkit],
    ]) {
      const b = await engine.launch();
      browsers.push(b);
      const c = await b.newContext();
      await login(c, fixture.username);
      const p = await c.newPage();
      instrument(p);
      for (const [lang, width] of [
        ["en", 390],
        ["zh", 1440],
      ]) {
        await locale(c, lang);
        await p.setViewportSize({ width, height: 900 });
        await test(
          name + "-" + lang + "-" + width,
          () => roundTrip(p, lang, "explicit", "detail"),
          p,
        );
      }
      await c.close();
    }
    await locale(context, "en");
    await page.setViewportSize({ width: 1440, height: 900 });
    await test(
      "keyboard-spaced-query",
      () => roundTrip(page, "en", "keyboard", "title", " LEARN "),
      page,
    );
    await test(
      "title-edit-return",
      async () => {
        await list(page, "en");
        const row = page.locator(".library-row").last();
        await row.locator("h2 a").click();
        await page
          .getByRole("button", { name: t("en", "l.title.edit"), exact: true })
          .click();
        const changed = fixture.title + " again";
        await page.locator("#batch-title").fill(changed);
        await page
          .getByRole("button", { name: t("en", "l.title.save"), exact: true })
          .click();
        await expect(page.locator(".batch-title")).toHaveText(changed);
        await page
          .getByRole("link", { name: t("en", "l.backLibrary"), exact: true })
          .click();
        await expect(page.locator(".library-row")).toHaveCount(21);
        await page.waitForTimeout(700);
        await expect(row.locator("h2 a")).toHaveText(changed);
        await expect(row.locator("h2 a")).toBeFocused();
        await expect(row.locator("h2 a")).toBeInViewport();
        fixture.title = changed;
      },
      page,
    );
    await test(
      "unrelated-entry-and-direct-detail",
      async () => {
        await page.locator(".library-row").last().locator("h2 a").click();
        await page.locator('header a[href="/"]').first().click();
        await page.locator('header a[href="/library"]').first().click();
        await page.waitForTimeout(700);
        expect(await page.evaluate(() => scrollY)).toBe(0);
        await page.goto(
          origin + "/library/" + fixture.ids.at(-1) + "?entry=LEARN",
        );
        await ready(page);
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        await page
          .getByRole("link", { name: t("en", "l.backLibrary"), exact: true })
          .click();
        await expect(page.locator(".library-row")).toHaveCount(20);
        await page.waitForTimeout(700);
        expect(await page.evaluate(() => scrollY)).toBe(0);
      },
      page,
    );
    await test(
      "no-result-and-clear",
      async () => {
        await page.getByRole("searchbox").fill("word");
        await page
          .getByRole("button", { name: t("en", "l.searchAction"), exact: true })
          .click();
        await expect(
          page.getByText(t("en", "l.noresults"), { exact: true }),
        ).toBeVisible();
        await expect(page.locator(".library-row")).toHaveCount(0);
        await page
          .getByRole("button", { name: t("en", "l.clear"), exact: true })
          .click();
        await expect(page.locator(".library-row")).toHaveCount(20);
        await expect(page.getByRole("searchbox")).toHaveValue("");
      },
      page,
    );
    await test(
      "missing-row-after-delete",
      async () => {
        await list(page, "en");
        const id = fixture.ids.at(-1);
        await page.locator('[data-batch="' + id + '"] h2 a').click();
        await expect(page).toHaveURL(new RegExp("/library/" + id));
        await expect(page.locator(".batch-detail")).toBeVisible();
        await page
          .getByRole("button", { name: t("en", "l.delete"), exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog
          .getByRole("button", { name: t("en", "l.delete"), exact: true })
          .click();
        await expect(page.locator(".library-row")).toHaveCount(20);
        await page.waitForTimeout(700);
        await expect(page.getByRole("searchbox")).toHaveValue("LEARN");
        expect(await page.locator('[data-batch="' + id + '"]').count()).toBe(0);
        const visible = await page.locator(".library-row").last().isVisible();
        expect(visible).toBe(true);
        expect(
          await page.evaluate(
            () =>
              scrollY <= document.documentElement.scrollHeight - innerHeight,
          ),
        ).toBe(true);
      },
      page,
    );
    await test("empty-library", async () => {
      const c = await browser.newContext();
      try {
        const username = "cr012_empty_" + Date.now();
        await ok(c, "/auth/register", "POST", {
          username,
          password: env.ADMIN_PASSWORD,
          password_confirmation: env.ADMIN_PASSWORD,
          ui_locale: "en-US",
        });
        const p = await c.newPage();
        instrument(p);
        await p.goto(origin + "/library");
        await ready(p);
        await expect(p.locator(".library-row")).toHaveCount(0);
        await expect(
          p.getByText(t("en", "l.empty"), { exact: true }),
        ).toBeVisible();
      } finally {
        await c.close();
      }
    });
    await test(
      "library-accessibility-runtime",
      async () => {
        await expect(page.locator(".library-page")).toBeVisible();
        const AxeBuilder = require("@axe-core/playwright").default;
        const scan = await new AxeBuilder({ page })
          .include(".library-page")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        dump("axe.json", {
          violations: scan.violations,
          passes: scan.passes.map((x) => x.id),
        });
        expect(scan.violations).toEqual([]);
        expect(runtime).toEqual([]);
      },
      page,
    );
  }
  await context.close();
} catch (e) {
  results.push({ id: action, result: "FAIL", error: String(e) });
  console.error(String(e));
} finally {
  dump("results.json", {
    results,
    runtime,
    localProviderCalls: calls,
    realProviderCalls: 0,
  });
  dump("details.json", details);
  for (const browser of browsers) await browser.close();
  if (providerStarted) await new Promise((r) => provider.close(r));
  await new Promise((r) => proxy.close(r));
  if (results.some((x) => x.result === "FAIL")) process.exitCode = 1;
}
