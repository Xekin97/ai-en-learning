// Dedicated disposable PG/API + deterministic local provider. Never targets UAT.
import { createServer, request as httpRequest } from "node:http";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium, expect }=createRequire(process.cwd()+"/frontend/package.json")("@playwright/test");
const out=new URL("./real-storage/",import.meta.url), results=[];
const learnerName="qa2_learner_"+Date.now();
const work = readFileSync("/tmp/wordweave-fe-m002-current", "utf8");
if (!work.startsWith("/var/folders/") && !work.startsWith("/tmp/"))
  throw Error("Disposable stack required");
const env = JSON.parse(readFileSync(work + "/env.json", "utf8"));
const origin = "http://127.0.0.1:3301";
if (
  env.PUBLIC_ORIGIN !== origin ||
  env.OPENROUTER_BASE_URL !== "http://127.0.0.1:38082" ||
  !env.APP_DATABASE_URL.includes("63541/wordweave_fe_m002")
)
  throw Error("Wrong stack");
const copy = JSON.parse(
  readFileSync(
    process.cwd()+"/.planning/milestones/M002/design/copy.json",
  ),
);
const t = (k) => copy.static["en." + k] ?? copy.templates["en." + k];
const passage =
  "A thoughtful student learns(learn) by building a steady learning(learn) routine through daily reading and discussion. Each morning the student reviews a few ideas, connects them with practical examples, and writes a short reflection. Friends later compare their observations, ask clear questions, and share useful explanations about what they learned(learn). This patient practice makes new knowledge easier to remember and apply with confidence.";
let calls = 0;
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
  const candidate = {
    passage:
      passage +
      (probe
        ? " The group also discussed vulnerability(vulnerable) with empathy."
        : ""),
    tags: ["study"],
    targets: {
      learn: {
        entry_meaning: "gain knowledge through study",
        hint_phrase:
          "learning(learn) through learned(learn) examples while learning(learn)",
      },
    },
  };
  if (probe)
    candidate.targets.vulnerable = {
      entry_meaning: "open to harm",
      hint_phrase: "vulnerable(vulnerable) communities",
    };
  res.setHeader("content-type", "text/event-stream");
  res.end(
    "data: " +
      JSON.stringify({
        choices: [{ delta: { content: JSON.stringify(candidate) } }],
      }) +
      "\n\ndata: [DONE]\n\n",
  );
});
await new Promise((r) => provider.listen(38082, "127.0.0.1", r));
const proxy = createServer((req, res) => {
  const upstream = httpRequest(
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
  upstream.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});
await new Promise((r) => proxy.listen(3301, "127.0.0.1", r));
const browser = await chromium.launch();
const failures = [];
const observed = [];
const admin = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
async function pageFor(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("console", (m) => {
    if (/hydration.*mismatch|m002\..*not found/i.test(m.text()))
      failures.push(m.text());
  });
  return page;
}
const ready = (page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
async function read(context, path) {
  const r = await context.request.get(origin + "/api/v1" + path);
  if (!r.ok()) throw Error(path + ": " + r.status());
  return r.json();
}
async function write(context, path, method, body) {
  const b = await read(context, "/bootstrap");
  const r = await context.request.fetch(origin + "/api/v1" + path, {
    method,
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "x-csrf-token": b.data.csrf_token,
    },
    data: body,
  });
  if (!r.ok()) {
    let code;
    try {
      code = (await r.json()).error?.code;
    } catch {
      /* The status still identifies a non-JSON failure. */
    }
    throw Error(path + ": " + r.status() + " " + code);
  }
  return r.status() === 204 ? null : r.json();
}
try {
  const page = await pageFor(admin);
  await page.goto(origin + "/login");
  await ready(page);
  await page.locator("input[autocomplete=username]").fill(env.ADMIN_USERNAME);
  await page.locator("input[type=password]").fill(env.ADMIN_PASSWORD);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(origin + "/admin");
  observed.push("real admin login + overview");
  const cred = await read(admin, "/admin/openrouter-credential");
  await write(admin, "/admin/openrouter-credential", "PUT", {
    api_key: "integration-secret-key",
    confirmed: true,
    expected_revision: cred.data.revision,
  });
  const existing = await read(admin, "/admin/models");
  const old = existing.data.items.find(
    (m) => m.openrouter_model_id === "provider/integration",
  );
  const created = old
    ? { data: { model: old, revision: existing.data.revision } }
    : await write(admin, "/admin/models", "POST", {
        display_name: "Local integration model",
        description: "Synthetic local provider",
        openrouter_model_id: "provider/integration",
      });
  const modelId = created.data.model.id;
  if (!created.data.model.enabled)
    await write(admin, "/admin/models/" + modelId + "/enable", "POST", {
      expected_revision: created.data.revision,
    });
  for (const code of ["basic", "visitor"]) {
    const groups = await read(admin, "/admin/groups");
    const group = groups.data.items.find((g) => g.code === code);
    await write(admin, "/admin/groups/" + code, "PUT", {
      expected_revision: groups.data.revision,
      priority: group.priority,
      max_entries: 5,
      rolling_24h_limit: 50,
      model_ids: [modelId],
      allowed_lengths: ["short"],
    });
  }
  for (const route of [
    "models",
    "plans",
    "users?all=1",
    "growth",
    "notices",
    "analytics",
    "presets",
  ]) {
    await page.goto(origin + "/admin/" + route);
    await ready(page);
    await expect(page.locator(".notice.error")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(/m002\.[a-z_]+/);
  }
  observed.push(
    "all 8 admin modules accept real DTOs, no initial operational reward fixtures",
  );
  const config = await read(admin, "/admin/growth/levels");
  if (!config.data.items.length) {
    const input = {
      expected_revision: config.data.revision,
      changes: [1, 2].map((n) => ({
        client_key: randomUUID(),
        id: null,
        value: {
          level_number: n,
          min_experience: n === 1 ? "0" : "10",
          reward_enabled: n !== 1,
          reward: { points: "0", item_definition_id: null, item_count: 0 },
        },
      })),
    };
    const impact = await write(
      admin,
      "/admin/growth/levels/impact-preview",
      "POST",
      input,
    );
    const saved = await write(admin, "/admin/growth/levels", "PUT", {
      ...input,
      confirmation_token: impact.data.confirmation_token,
      confirmed: true,
    });
    expect(saved.data.saved_rows).toHaveLength(2);
  }
  // Seed an already effective rule in the disposable database to avoid waiting
  // until 04:00. This never changes an operational database or app defaults.
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
  observed.push(
    "real atomic multi-row level preview/save and isolated growth activation",
  );

  await page.goto(origin + "/admin/presets");
  await ready(page);
  await page
    .getByLabel(t("preset.name"), { exact: true })
    .fill("Learning together");
  await page
    .getByRole("combobox", { name: t("model"), exact: true })
    .selectOption(modelId);
  await page
    .getByRole("combobox", { name: t("explain"), exact: true })
    .selectOption("en");
  await page.getByLabel(t("words"), { exact: true }).fill("learn");
  await page
    .getByRole("button", { name: t("save.draft"), exact: true })
    .click();
  await page
    .getByRole("button", { name: t("previewgen"), exact: true })
    .click();
  await expect(page.locator(".preset-sample-text")).toContainText(
    "thoughtful student",
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: t("publish"), exact: true }).click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("confirm"), exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  observed.push("admin draft → real independent preview SSE → publish");
  const learner = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const lp = await pageFor(learner);
  await lp.goto(origin + "/explore");
  await ready(lp);
  await expect(lp.locator("body")).toContainText("Learning together");
  await lp
    .getByRole("link", { name: t("try"), exact: true })
    .first()
    .click();
  await ready(lp);
  await lp.getByRole("button", { name: t("start"), exact: true }).click();
  await expect(
    lp.locator("[data-region=generation-result] .story-text"),
  ).toContainText("thoughtful student", { timeout: 20000 });
  await lp
    .getByRole("button", { name: t("guestcollect"), exact: true })
    .click();
  await expect(lp).toHaveURL(/\/login\?claim=1/);
  await lp.locator('.auth-form a[href^="/register"]').click();
  await expect(lp).toHaveURL(/\/register\?claim=1/);
  await lp
    .locator("input[autocomplete=username]")
    .fill(learnerName);
  await lp.locator("input[type=password]").nth(0).fill(env.ADMIN_PASSWORD);
  await lp.locator("input[type=password]").nth(1).fill(env.ADMIN_PASSWORD);
  await lp.locator("form button[type=submit]").click();
  await expect(lp).toHaveURL(/\/library\/[a-f0-9-]+/);
  observed.push(
    "visitor preset generation → register → one-time claim to personal library",
  );

  const batchId=new URL(lp.url()).pathname.split('/').at(-1);
  await lp.getByRole('button',{name:t('l.single'),exact:true}).click();await expect(lp.locator('.slot')).toHaveCount(5);
  const reviewURL=lp.url();expect(reviewURL).toMatch(/review\//);
  const blocked=await browser.newContext({storageState:await learner.storageState()});
  await blocked.addInitScript(()=>{IDBFactory.prototype.open=function(){throw new DOMException('QA unavailable IndexedDB','SecurityError')}});
  const bp=await pageFor(blocked);await bp.goto(reviewURL);await ready(bp);
  await expect(bp.locator('main [role=alert]')).toBeVisible();
  const evidence={reviewPath:new URL(reviewURL).pathname,slots:await bp.locator('.slot').count(),text:await bp.locator('main').innerText(),providerCalls:calls,realProviderCalls:0};
  await bp.getByRole('button',{name:t('restart'),exact:true}).click();await expect(bp.locator('main [role=alert]')).toBeVisible();
  evidence.afterRestartSlots=await bp.locator('.slot').count();evidence.result=evidence.slots===0&&evidence.afterRestartSlots===0?'FAIL':'PASS';
  await bp.screenshot({path:new URL('denied.png',out).pathname,fullPage:true});
  writeFileSync(new URL('result.json',out),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();await new Promise(r=>provider.close(r));await new Promise(r=>proxy.close(r))}
