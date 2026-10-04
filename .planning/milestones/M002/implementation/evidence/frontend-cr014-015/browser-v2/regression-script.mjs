// Run from the product root against m002-local-stack and production Nuxt on 3331.
// Use a new output directory; optional third argument reuses an existing fixture.json.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer, request as httpRequest } from "node:http";
import { execFileSync } from "node:child_process";
const require = createRequire(process.cwd() + "/frontend/package.json");
const { chromium, firefox, webkit, expect } = require("@playwright/test");
const out = resolve(process.argv[2]);
mkdirSync(out);
const selected = process.env.CR014_CASES?.split(",");
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
    const cred = await ok(admin, "/admin/openrouter-credential");
    await ok(admin, "/admin/openrouter-credential", "PUT", {
      api_key: "cr014-local-only-key",
      confirmed: true,
      expected_revision: cred.revision,
    });
    const m = await ok(admin, "/admin/models", "POST", {
      display_name: "CR014 local fixture",
      description: "Disposable provider",
      openrouter_model_id: "provider/integration",
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
    const username = "cr014_" + Date.now();
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
  const response = p.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/v1/me/batches" &&
      r.request().method() === "GET",
  );
  await p
    .getByRole("button", { name: t(lang, "l.searchAction"), exact: true })
    .click();
  await response;
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

const statKeys = [
  "generation_count",
  "unique_learned_entries",
  "participating_batches",
  "paused_batches",
  "successful_review_count",
  "batches_ever_reviewed_successfully",
];
const uiStats = (p) =>
  p
    .locator(".library-stats dd")
    .evaluateAll((els) => els.map((el) => Number(el.textContent)));
const serverStats = async (c) => {
  const s = await ok(c, "/me/learning-summary");
  return statKeys.map((k) => s[k]);
};
async function search(p, lang, term, enter = false) {
  await p.getByRole("searchbox").fill(term);
  const response = p.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/v1/me/batches" &&
      r.request().method() === "GET",
  );
  if (enter) await p.getByRole("searchbox").press("Enter");
  else
    await p
      .getByRole("button", { name: t(lang, "l.searchAction"), exact: true })
      .click();
  expect((await response).status()).toBe(200);
  await expect(p.getByRole("searchbox")).toBeFocused();
  await expect(p.getByRole("searchbox")).toBeInViewport();
}
async function toggle(p, c, checkbox, value, lang) {
  const before = await serverStats(c);
  const response = p.waitForResponse(
    (r) => r.request().method() === "PATCH" && /\/me\/batches\//.test(r.url()),
  );
  await expect(checkbox).toBeChecked({ checked: !value });
  await checkbox.click();
  expect((await response).status()).toBe(200);
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).toBeFocused();
  await expect(checkbox).toBeInViewport();
  await expect(checkbox).toBeChecked({ checked: value });
  const after = await serverStats(c);
  expect(after[2]).toBe(before[2] + (value ? 1 : -1));
  expect(after[3]).toBe(before[3] + (value ? -1 : 1));
  expect(after.filter((_, i) => i !== 2 && i !== 3)).toEqual(
    before.filter((_, i) => i !== 2 && i !== 3),
  );
  if (await p.locator(".library-stats").count())
    await expect.poll(() => uiStats(p)).toEqual(after);
  details.push({
    action,
    lang,
    before,
    after,
    focused: await checkbox.evaluate((el) => el === document.activeElement),
  });
}
await new Promise((r) => proxy.listen(3301, "127.0.0.1", r));
const browsers = [];
let providerStarted = false;
try {
  const browser = await chromium.launch();
  browsers.push(browser);
  if (process.argv[3]) fixture = JSON.parse(readFileSync(process.argv[3]));
  else {
    await new Promise((r) => provider.listen(38082, "127.0.0.1", r));
    providerStarted = true;
    fixture = await seed(browser);
  }
  dump("fixture.json", fixture);
  const proto = await browser.newPage();
  for (const width of [320, 1440]) {
    await proto.setViewportSize({ width, height: 900 });
    await proto.goto("http://127.0.0.1:4186/prototype/?page=library&lang=en");
    await expect(proto.locator(".library-row").first()).toBeVisible();
    await proto.screenshot({ path: join(out, "prototype-" + width + ".png") });
  }
  await proto.close();
  for (const [engineName, engine, widths] of [
    ["chromium", chromium, [320, 390, 768, 1440]],
    ["firefox", firefox, [390]],
    ["webkit", webkit, [1440]],
  ]) {
    const b = engineName === "chromium" ? browser : await engine.launch();
    if (b !== browser) browsers.push(b);
    const c = await b.newContext();
    await login(c, fixture.username);
    await ok(c, "/me/batches/" + fixture.ids.at(-1), "PATCH", {
      participates_in_range_review: true,
    });
    await ok(c, "/me/batches/" + fixture.ids[0], "PATCH", {
      participates_in_range_review: true,
    });
    const p = await c.newPage();
    instrument(p);
    for (const lang of ["en", "zh"]) {
      await locale(c, lang);
      for (const width of widths) {
        await p.setViewportSize({ width, height: 900 });
        await test(
          engineName + "-" + lang + "-" + width,
          async () => {
            await p.goto(origin + "/library");
            await ready(p);
            await expect(p.locator(".library-row")).toHaveCount(20);
            const baseline = await serverStats(c);
            await search(p, lang, "LEARN");
            const oldIDs = await p
              .locator(".library-row")
              .evaluateAll((els) => els.map((el) => el.dataset.batch));
            await p
              .getByRole("button", { name: t(lang, "l.more"), exact: true })
              .click();
            await expect(p.locator(".library-row")).toHaveCount(21);
            const added = p.locator(".library-row").nth(20).locator("h2 a");
            await expect(added).toBeFocused();
            await expect(added).toBeInViewport();
            expect(
              await p
                .locator(".library-row")
                .evaluateAll((els) =>
                  els.slice(0, 20).map((el) => el.dataset.batch),
                ),
            ).toEqual(oldIDs);
            const checkbox = p
              .locator(".library-row")
              .last()
              .getByRole("checkbox");
            await toggle(p, c, checkbox, false, lang);
            await toggle(p, c, checkbox, true, lang);
            expect(await uiStats(p)).toEqual(baseline);
            await expect(p.getByRole("searchbox")).toHaveValue("LEARN");
            await expect(p.locator(".library-row")).toHaveCount(21);
            await p.screenshot({ path: join(out, action + ".png") });
            expect(
              await p.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            await search(p, lang, "word", true);
            await expect(p.locator(".library-row")).toHaveCount(0);
            await expect(
              p.getByText(t(lang, "l.noresults"), { exact: true }),
            ).toBeVisible();
            const response = p.waitForResponse(
              (r) =>
                new URL(r.url()).pathname === "/api/v1/me/batches" &&
                r.request().method() === "GET",
            );
            await p
              .getByRole("button", { name: t(lang, "l.clear"), exact: true })
              .click();
            await response;
            await expect(p.locator(".library-row")).toHaveCount(20);
            await expect(p.getByRole("searchbox")).toBeFocused();
            await expect(p.getByRole("searchbox")).toHaveValue("");
            const first = p
              .locator(".library-row")
              .first()
              .getByRole("checkbox");
            await toggle(p, c, first, false, lang);
            await toggle(p, c, first, true, lang);
            const labels = await p
              .locator(".library-stats dt span")
              .allTextContents();
            expect(labels).toEqual(
              [
                "generated",
                "words",
                "participating",
                "paused",
                "successes",
                "successfulbatches",
              ].map((k) => t(lang, "l.stat." + k)),
            );
          },
          p,
        );
      }
    }
    await locale(c, "en");
    await test(engineName + "-return", () => roundTrip(p, "en", "explicit"), p);
    if (engineName === "chromium") {
      await test("history-return", () => roundTrip(p, "en", "history"), p);
      await test(
        "shared-detail-participation",
        async () => {
          await p.locator(".library-row").last().locator("h2 a").click();
          await expect(p.locator(".batch-detail")).toBeVisible();
          const cb = p.locator(".batch-detail").getByRole("checkbox");
          await toggle(p, c, cb, false, "en");
          await p
            .getByRole("link", { name: t("en", "l.backLibrary"), exact: true })
            .click();
          await expect(p.locator(".library-row")).toHaveCount(21);
          await expect.poll(() => uiStats(p)).toEqual(await serverStats(c));
          await toggle(
            p,
            c,
            p.locator(".library-row").last().getByRole("checkbox"),
            true,
            "en",
          );
        },
        p,
      );
      await test(
        "participation-failure-retry",
        async () => {
          await list(p, "en");
          const cb = p.locator(".library-row").last().getByRole("checkbox"),
            baseline = await uiStats(p);
          const pattern = "**/api/v1/me/batches/" + fixture.ids.at(-1);
          let failed = false;
          await p.route(pattern, (r) => {
            if (r.request().method() === "PATCH" && !failed) {
              failed = true;
              return r.abort("failed");
            }
            return r.continue();
          });
          await cb.click();
          await expect(cb).toBeEnabled();
          await expect(cb).toBeFocused();
          await expect(cb).toBeChecked();
          expect(await uiStats(p)).toEqual(baseline);
          expect(await serverStats(c)).toEqual(baseline);
          await expect(
            p.getByText(t("en", "failed"), { exact: true }).first(),
          ).toBeVisible();
          await p.unroute(pattern);
          await toggle(p, c, cb, false, "en");
          await toggle(p, c, cb, true, "en");
        },
        p,
      );
      await test(
        "more-failure-retry",
        async () => {
          await p.goto(origin + "/library");
          await ready(p);
          const ids = await p
            .locator(".library-row")
            .evaluateAll((els) => els.map((el) => el.dataset.batch));
          const pattern = "**/api/v1/me/batches?**";
          let failed = false;
          await p.route(pattern, (r) => {
            if (
              new URL(r.request().url()).searchParams.has("cursor") &&
              !failed
            ) {
              failed = true;
              return r.abort("failed");
            }
            return r.continue();
          });
          const more = p.getByRole("button", {
            name: t("en", "l.more"),
            exact: true,
          });
          await more.click();
          await expect(more).toBeEnabled();
          await expect(more).toBeFocused();
          expect(
            await p
              .locator(".library-row")
              .evaluateAll((els) => els.map((el) => el.dataset.batch)),
          ).toEqual(ids);
          await p.unroute(pattern);
          await more.click();
          await expect(p.locator(".library-row")).toHaveCount(21);
          await expect(
            p.locator(".library-row").last().locator("h2 a"),
          ).toBeFocused();
          await expect(p.locator(".app-error")).toHaveCount(0);
        },
        p,
      );
      await test(
        "summary-failure-retry",
        async () => {
          const cb = p.locator(".library-row").last().getByRole("checkbox"),
            baseline = await uiStats(p);
          await p.route("**/api/v1/me/learning-summary", (r) =>
            r.abort("failed"),
          );
          await cb.click();
          await expect(cb).toBeEnabled();
          await expect(cb).toBeFocused();
          await expect(cb).not.toBeChecked();
          expect(await uiStats(p)).toEqual(baseline);
          expect((await serverStats(c))[2]).toBe(baseline[2] - 1);
          await expect(
            p.getByText(t("en", "failed"), { exact: true }).first(),
          ).toBeVisible();
          await p.unroute("**/api/v1/me/learning-summary");
          await toggle(p, c, cb, true, "en");
        },
        p,
      );
      await test(
        "accessible-library",
        async () => {
          const { default: AxeBuilder } = require("@axe-core/playwright");
          const axe = await new AxeBuilder({ page: p })
            .include(".library-page")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          dump("axe.json", axe.violations);
          expect(axe.violations).toEqual([]);
          expect(
            runtime.filter(
              (x) =>
                x.kind === "pageerror" ||
                (!x.action.includes("failure") && x.kind === "error"),
            ),
          ).toEqual([]);
        },
        p,
      );
    }
    await c.close();
  }
} finally {
  dump("details.json", details);
  dump("results.json", {
    results,
    runtime,
    localProviderCalls: calls,
    realProviderCalls: 0,
  });
  for (const b of browsers) await b.close();
  await new Promise((r) => proxy.close(r));
  if (providerStarted) await new Promise((r) => provider.close(r));
}
if (results.some((x) => x.result === "FAIL")) process.exitCode = 1;
