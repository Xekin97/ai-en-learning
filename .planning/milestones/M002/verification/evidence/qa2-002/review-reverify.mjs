// Dedicated disposable PG/API + deterministic local provider. Never targets UAT.
import { createServer, request as httpRequest } from "node:http";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium, expect }=createRequire(process.cwd()+"/frontend/package.json")("@playwright/test");
const out=new URL("./",import.meta.url), results=[];
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
  const ctx=await browser.newContext({storageState:await learner.storageState(),viewport:{width:1280,height:900}});
  await ctx.addInitScript(()=>{
    window.qaStorageFault=localStorage.getItem('qa-storage-fault');
    const open=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(...args){if(args[0]==='wordweave-review-drafts'&&window.qaStorageFault==='all')throw new DOMException('QA denied','SecurityError');return open.apply(this,args)};
    const transaction=IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(this.name==='wordweave-review-drafts'&&args[1]==='readwrite'&&window.qaStorageFault==='write')queueMicrotask(()=>tx.abort());return tx;};
  });
  const p=await pageFor(ctx),button=(k)=>p.getByRole('button',{name:t(k),exact:true});
  const warning=()=>p.getByRole('alert').filter({hasText:t('failed')});
  const fault=mode=>p.evaluate(mode=>{window.qaStorageFault=mode;if(mode)localStorage.setItem('qa-storage-fault',mode);else localStorage.removeItem('qa-storage-fault')},mode);
  async function entries(){return p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('wordweave-review-drafts',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readonly'),get=tx.objectStore('drafts').getAll();tx.oncomplete=()=>{db.close();resolve(get.result)};tx.onabort=()=>{db.close();reject(tx.error)}}}));}
  async function start(){await p.goto(origin+'/library/'+batchId);await ready(p);await button('l.single').click();await expect(p).toHaveURL(/\/review\//);await expect(p.locator('.slot')).toHaveCount(5)}
  async function check(id,name,fn){try{await fn();results.push({id,name,result:'PASS'})}catch(e){results.push({id,name,result:'FAIL',error:String(e)});await p.screenshot({path:new URL(id+'-failure.png',out).pathname,fullPage:true}).catch(()=>{})}console.log(id,results.at(-1).result)}
  async function submit(){await button('overview').click();await button('submit').click();await expect(p.locator('.result-word')).toHaveCount(4)}
  await p.goto(origin+'/library/'+batchId);await ready(p);
  await check('R01','Real API: denied initial storage allows edit, overview corrections, submit, retry cleanup and receipt-only reload',async()=>{
    await fault('all');await start();await expect(warning()).toBeVisible();
    await p.locator('.slot').first().fill('x');await warning().getByRole('button',{name:t('retry'),exact:true}).click();await expect(p.locator('.slot').first()).toHaveValue('x');
    await button('next').click();await expect(p.locator('.gap')).toHaveCount(3);await p.locator('.gap').first().fill('wrong');
    await button('overview').click();await p.locator('.answer-link').first().click();await p.locator('.slot').first().fill('z');await button('next').click();
    await expect(p.locator('.answer-link').first()).toHaveText('z');
    const sent=p.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/submit'));await button('submit').click();const payload=(await sent).postDataJSON();expect(payload.words[0].answer).toBe('z');expect(payload.passage[0].answer).toBe('wrong');
    await expect(p.locator('.result-word .bad').first()).toHaveText('z');await expect(warning()).toBeVisible();await p.screenshot({path:new URL('R01-denied-submitted.png',out).pathname,fullPage:true});
    const sid=new URL(p.url()).pathname.split('/').at(-1);expect((await read(ctx,'/me/review-sessions/'+sid)).data.session.status).toBe('completed');
    await fault(null);await warning().getByRole('button',{name:t('retry'),exact:true}).click();await expect(warning()).toHaveCount(0);expect(await entries()).toEqual([]);
    await p.reload();await ready(p);await expect(p.locator('.result-word')).toHaveCount(0);await expect(p.getByText(t('l.summary.unavailable'),{exact:true})).toBeVisible();
  });
  await check('R02','Real API: write transaction failure keeps latest input and still submits; later cleanup removes persisted old answer',async()=>{
    await fault(null);await start();await p.locator('.slot').first().fill('a');await expect.poll(async()=>JSON.stringify(await entries())).toContain('"a"');
    await fault('write');await p.locator('.slot').first().fill('b');await expect(warning()).toBeVisible();await warning().getByRole('button',{name:t('retry'),exact:true}).click();await expect(p.locator('.slot').first()).toHaveValue('b');expect(JSON.stringify(await entries())).toContain('"a"');
    await submit();await expect(p.locator('.result-word .bad').first()).toHaveText('b');await expect(warning()).toBeVisible();
    await fault(null);await warning().getByRole('button',{name:t('retry'),exact:true}).click();await expect(warning()).toHaveCount(0);expect(await entries()).toEqual([]);
  });
  await check('R03','Real API: storage recovery requires confirmation and cannot replace an existing saved answer',async()=>{
    await start();await p.locator('.slot').first().fill('a');await expect.poll(async()=>JSON.stringify(await entries())).toContain('"a"');
    await fault('all');await p.reload();await ready(p);await expect(p.locator('.slot')).toHaveCount(5);await p.locator('.slot').first().fill('b');
    await fault(null);await warning().getByRole('button',{name:t('retry'),exact:true}).click();await expect(p.locator('#restore-draft[open]')).toBeVisible();
    expect(JSON.stringify(await entries())).toContain('"a"');expect(JSON.stringify(await entries())).not.toContain('"b"');
    await p.screenshot({path:new URL('R03-recovery-confirmation.png',out).pathname,fullPage:true});
    await p.locator('#restore-draft').getByRole('button',{name:t('resume'),exact:true}).click();await expect(p.locator('.slot').first()).toHaveValue('a');await submit();
  });
  await check('R04','Real API: unknown local schema is preserved on retry; explicit restart removes it and opens a fresh server attempt',async()=>{
    await start();await p.locator('.slot').first().fill('c');await expect.poll(async()=>JSON.stringify(await entries())).toContain('"c"');
    const sid=new URL(p.url()).pathname.split('/').at(-1),old=(await read(ctx,'/me/review-sessions/'+sid)).data.session.current_attempt.attempt_id;
    await p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('wordweave-review-drafts',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite'),c=tx.objectStore('drafts').openCursor();c.onsuccess=()=>{if(c.result)c.result.update({...c.result.value,schemaVersion:99})};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>{db.close();reject(tx.error)}}}));
    await p.reload();await ready(p);await expect(warning()).toBeVisible();await expect(p.locator('.slot')).toHaveCount(0);await warning().getByRole('button',{name:t('retry'),exact:true}).click();expect((await entries())[0].schemaVersion).toBe(99);
    await button('restart').click();await expect(p.locator('.slot')).toHaveCount(5);await expect(p.locator('.slot').first()).toHaveValue('');expect(await entries()).toEqual([]);
    expect((await read(ctx,'/me/review-sessions/'+sid)).data.session.current_attempt.attempt_id).not.toBe(old);await submit();
  });
  await check('R05','Real API and two tabs: other-tab draft changes require restore confirmation',async()=>{
    await start();await p.locator('.slot').first().fill('a');await expect.poll(async()=>JSON.stringify(await entries())).toContain('"a"');
    const other=await pageFor(ctx);try{await other.goto(p.url());await ready(other);await expect(other.locator('#restore-draft[open]')).toBeVisible();await other.locator('#restore-draft').getByRole('button',{name:t('resume'),exact:true}).click();await other.locator('.slot').first().fill('b');await expect(p.locator('#restore-draft[open]')).toBeVisible();await p.locator('#restore-draft').getByRole('button',{name:t('resume'),exact:true}).click();await expect(p.locator('.slot').first()).toHaveValue('b');}finally{await other.close()}await submit();
  });
  await check('R06','Random candidates exclude selected and current-library words, enforce limit, and do not charge or add learning',async()=>{
    const before=(await read(learner,'/me/learning-summary')).data;
    let selected=['adapt'];for(let i=0;i<4;i++){const result=(await write(learner,'/vocabulary/random','POST',{selected_entries:selected})).data;expect(result.reason).toBeNull();expect(selected).not.toContain(result.entry);expect(result.entry).not.toBe('learn');selected.push(result.entry)}
    const atLimit=(await write(learner,'/vocabulary/random','POST',{selected_entries:selected})).data;expect(atLimit).toEqual({entry:null,reason:'limit_reached'});expect((await read(learner,'/me/learning-summary')).data).toEqual(before);
  });
  await check('R07','Current and second sessions: password change keeps only current session; deletion revokes access and removes the owned batch',async()=>{
    const second=await browser.newContext(),outsider=await browser.newContext();
    const raw=async(c,path,method='GET',data)=>{const b=(await read(c,'/bootstrap')).data;return c.request.fetch(origin+'/api/v1'+path,{method,data,headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':b.csrf_token}})};
    try{await write(second,'/auth/login','POST',{username:learnerName,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
      const wrong=await raw(learner,'/me/password','PUT',{current_password:'incorrect',new_password:'QA-temporary-password-2026',new_password_confirmation:'QA-temporary-password-2026'});expect(wrong.status()).toBe(422);expect((await raw(second,'/me/account')).status()).toBe(200);
      await write(learner,'/me/password','PUT',{current_password:env.ADMIN_PASSWORD,new_password:'QA-temporary-password-2026',new_password_confirmation:'QA-temporary-password-2026'});expect((await raw(learner,'/me/account')).status()).toBe(200);expect((await raw(second,'/me/account')).status()).toBe(401);
      expect((await raw(outsider,'/auth/login','POST',{username:learnerName,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'})).status()).toBe(401);
      await write(second,'/auth/login','POST',{username:learnerName,password:'QA-temporary-password-2026',browser_ui_locale:'en-US'});
      expect((await raw(learner,'/me/account','DELETE',{current_password:'incorrect',confirmed:true})).status()).toBe(422);expect((await raw(learner,'/me/batches/'+batchId)).status()).toBe(200);
      await write(learner,'/me/account','DELETE',{current_password:'QA-temporary-password-2026',confirmed:true});expect((await raw(second,'/me/account')).status()).toBe(401);expect((await raw(second,'/me/batches/'+batchId)).status()).toBe(401);
      expect((await raw(outsider,'/auth/login','POST',{username:learnerName,password:'QA-temporary-password-2026',browser_ui_locale:'en-US'})).status()).toBe(401);expect((await read(admin,'/admin/models')).data.items.length).toBeGreaterThan(0);
    }finally{await second.close();await outsider.close()}
  });
  await ctx.close();
}catch(error){results.push({id:'setup',name:'fixture preparation',result:'FAIL',error:String(error)});console.error(String(error))}
finally{
  writeFileSync(new URL('review-reverify.json',out),JSON.stringify({results,fixturePreparation:observed,localProviderCalls:calls,realProviderCalls:0,pageErrors:failures},null,2));
  console.log(JSON.stringify({results,pageErrors:failures},null,2));await browser.close();await new Promise(r=>provider.close(r));await new Promise(r=>proxy.close(r));
  if(results.some(r=>r.result==='FAIL')||failures.length)process.exitCode=1;
}
