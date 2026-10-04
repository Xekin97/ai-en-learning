// Dedicated disposable PG/API + deterministic local provider. Never targets UAT.
import { createServer, request as httpRequest } from "node:http";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium, expect }=createRequire(process.cwd()+"/frontend/package.json")("@playwright/test");
const out=new URL("./",import.meta.url), results=[];
const learnerName="qa3_learner_"+Date.now();
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
      code = (await r.json()).code;
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
  const actor=(await read(learner,'/bootstrap')).data.actor;
  const userId=actor.id, second=await browser.newContext();
  await write(second,'/auth/login','POST',{username:learnerName,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
  const sql=q=>execFileSync('/opt/homebrew/opt/postgresql@18/bin/psql',[env.APP_DATABASE_URL,'-X','-t','-A','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();
  const scalar=q=>Number(sql(q));
  const columns={accounts:'id',account_sessions:'account_id',visitor_claims:'consumed_account_id',learning_batches:'owner_id',batch_targets:'owner_id',passage_occurrences:'owner_id',review_sessions:'owner_id',review_attempts:'owner_id',growth_balances:'owner_id',growth_settlements:'owner_id',growth_ledger:'owner_id',user_growth:'owner_id',user_learning_days:'owner_id',user_checkins:'owner_id',user_masteries:'owner_id',user_items:'owner_id',extra_credit_balances:'owner_id',analytics_events:'owner_id',traffic_session_accounts:'owner_id'};
  const counts=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid fixture ID');return Object.fromEntries(Object.entries(columns).map(([table,col])=>[table,scalar(`SELECT count(*) FROM wordweave.${table} WHERE ${col}='${id}'`)]));};
  async function raw(c,path,method='GET',body,idem){const headers={origin,'sec-fetch-site':'same-origin'};if(method!=='GET'){headers['x-csrf-token']=(await read(c,'/bootstrap')).data.csrf_token;if(idem)headers['Idempotency-Key']=idem;}return c.request.fetch(origin+'/api/v1'+path,{method,data:body,headers});}
  async function ok(c,path,method='GET',body,idem){const r=await raw(c,path,method,body,idem);if(!r.ok())throw Error(path+' '+r.status()+' '+await r.text());return r.status()===204?null:(await r.json()).data;}
  async function check(id,name,fn){try{await fn();results.push({id,name,result:'PASS'});}catch(e){results.push({id,name,result:'FAIL',error:String(e)});await lp.screenshot({path:new URL(id+'-failure.png',out).pathname,fullPage:true}).catch(()=>{});}console.log(id,results.at(-1).result);}
  const button=(key,scope=lp)=>scope.getByRole('button',{name:t(key),exact:true});
  let signBefore,signAfter,preDelete,postDelete,controlBefore,controlAfter;
  await check('S01','Successful guest claim auto-signs once; review masters unique lexeme and does not repeat daily sign-in',async()=>{
    signBefore=await ok(learner,'/me/growth');expect(signBefore.checkin.signed_today).toBe(true);expect(signBefore.points).toBe('1');expect(signBefore.experience).toBe('1');
    await button('l.single').click();await expect(lp.locator('.slot')).toHaveCount(5);
    for(const [i,char] of [...'learn'].entries())await lp.locator('.slot').nth(i).fill(char);
    await button('next').click();for(const [i,s] of ['learns','learning','learned'].entries())await lp.locator('.gap').nth(i).fill(s);
    await button('overview').click();await button('submit').click();await expect(lp.locator('.result-word')).toHaveCount(4);await expect(lp.locator('.result-word .bad')).toHaveCount(0);
    signAfter=await ok(learner,'/me/growth');expect(signAfter.mastered_total).toBe(1);expect(signAfter.points).toBe(signBefore.points);expect(signAfter.checkin).toEqual(signBefore.checkin);
  });
  const def=await ok(admin,'/admin/growth/items','POST',{kind:'extra_credit',name:{zh_CN:null,en_US:'Deletion fixture credits'},description:{zh_CN:null,en_US:'Two extra creations'},exchange_price:'0',activation_ttl_seconds:86400,effect:{kind:'extra_credit',extra_count:2}});
  await ok(admin,'/admin/growth/items/'+def.item.id+'/listing','PUT',{listed:true,expected_revision:def.revision});
  const owned=(await ok(learner,'/shop/exchanges','POST',{definition_id:def.item.id,quantity:1},randomUUID())).receipt.items[0].item_id;
  const activation=await ok(learner,'/me/items/'+owned+'/activation-preview','POST',{});
  await ok(learner,'/me/items/'+owned+'/activate','POST',{confirmation_token:activation.confirmation_token,confirm_discard:false},randomUUID());
  // A second real visitor claim proves deletion cannot damage another owner.
  const control=await browser.newContext(),cp=await pageFor(control),controlName='qa3_control_'+Date.now();
  await cp.goto(origin+'/explore');await ready(cp);await cp.getByRole('link',{name:t('try'),exact:true}).first().click();await ready(cp);await cp.getByRole('button',{name:t('start'),exact:true}).click();await expect(cp.locator('[data-region=generation-result] .story-text')).toContainText('thoughtful student',{timeout:20000});
  await cp.getByRole('button',{name:t('guestcollect'),exact:true}).click();await expect(cp).toHaveURL(/\/login\?claim=1/);await cp.locator('.auth-form a[href^="/register"]').click();await cp.locator('input[autocomplete=username]').fill(controlName);await cp.locator('input[type=password]').nth(0).fill(env.ADMIN_PASSWORD);await cp.locator('input[type=password]').nth(1).fill(env.ADMIN_PASSWORD);await cp.locator('form button[type=submit]').click();await expect(cp).toHaveURL(/\/library\/[a-f0-9-]+/);
  const controlBatch=new URL(cp.url()).pathname.split('/').at(-1),controlId=(await read(control,'/bootstrap')).data.actor.id;
  await cp.close();
  await lp.goto(origin+'/account');await ready(lp);
  const deletes=[];lp.on('request',r=>{if(r.method()==='DELETE'&&r.url().endsWith('/me/account'))deletes.push({confirmed:r.postDataJSON().confirmed})});
  await check('S02','Account UI requires both confirmations; wrong password leaves account and content intact',async()=>{
    await button('deleteaccount').click();let dialog=lp.locator('dialog[open]');
    await expect(dialog).toContainText(t('deleteaccount.desc'));await dialog.getByLabel(t('i.current'),{exact:true}).fill(env.ADMIN_PASSWORD);
    await button('confirm',dialog).click();expect(deletes).toHaveLength(0);await expect(dialog.locator('input[type=checkbox]')).not.toBeChecked();
    await dialog.getByLabel(t('i.delete.confirm'),{exact:true}).check();await button('confirm',dialog).click();await expect(dialog).toContainText(t('i.delete.final'));await button('cancel',dialog).click();expect(deletes).toHaveLength(0);
    await button('deleteaccount').click();dialog=lp.locator('dialog[open]');await dialog.getByLabel(t('i.current'),{exact:true}).fill('wrong-password');await dialog.getByLabel(t('i.delete.confirm'),{exact:true}).check();await button('confirm',dialog).click();
    const rejected=lp.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().endsWith('/me/account'));await button('deleteaccount',dialog).click();expect((await rejected).status()).toBe(422);await expect(dialog.locator('.app-error')).toBeVisible();
    expect((await raw(second,'/me/batches/'+batchId)).status()).toBe(200);expect((await raw(learner,'/me/account','DELETE',{current_password:env.ADMIN_PASSWORD,confirmed:false})).status()).toBe(422);expect(counts(userId).visitor_claims).toBe(1);
    await lp.screenshot({path:new URL('S02-password-protection.png',out).pathname,fullPage:true});await button('cancel',dialog).click();
  });
  await check('S03','Real account page deletes claimed account, populated personal data and all sessions, preserving another owner',async()=>{
    preDelete=counts(userId);controlBefore=counts(controlId);for(const [table,count]of Object.entries(preDelete))expect(count,table+' must be populated').toBeGreaterThan(0);
    const sharedBefore=scalar('SELECT count(*) FROM wordweave.item_definitions');
    await button('deleteaccount').click();const dialog=lp.locator('dialog[open]');await dialog.getByLabel(t('i.current'),{exact:true}).fill(env.ADMIN_PASSWORD);await dialog.getByLabel(t('i.delete.confirm'),{exact:true}).check();await button('confirm',dialog).click();
    const response=lp.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().endsWith('/me/account'));await button('deleteaccount',dialog).click();expect((await response).status()).toBe(204);await expect(lp).toHaveURL(origin+'/');
    for(const ctx of [learner,second]){expect((await raw(ctx,'/me/account')).status()).toBe(401);expect((await raw(ctx,'/me/batches/'+batchId)).status()).toBe(401)}
    const anon=await browser.newContext();expect((await raw(anon,'/auth/login','POST',{username:learnerName,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'})).status()).toBe(401);await anon.close();
    postDelete=counts(userId);expect(Object.values(postDelete).every(v=>v===0)).toBe(true);controlAfter=counts(controlId);expect(controlAfter).toEqual(controlBefore);expect((await raw(control,'/me/batches/'+controlBatch)).status()).toBe(200);expect(scalar('SELECT count(*) FROM wordweave.item_definitions')).toBe(sharedBefore);
    await lp.screenshot({path:new URL('S03-deleted-home.png',out).pathname,fullPage:true});
  });
  await check('S04','Unclaimed account also deletes normally and cannot retain an authenticated session',async()=>{
    const clean=await browser.newContext();await ok(clean,'/auth/register','POST',{username:'qa3_clean_'+Date.now(),password:env.ADMIN_PASSWORD,password_confirmation:env.ADMIN_PASSWORD,ui_locale:'en-US'});expect((await raw(clean,'/me/account','DELETE',{current_password:env.ADMIN_PASSWORD,confirmed:true})).status()).toBe(204);expect((await raw(clean,'/me/account')).status()).toBe(401);await clean.close();
  });
  writeFileSync(new URL('account-data.json',out),JSON.stringify({preDelete,postDelete,controlBefore,controlAfter,signBefore,signAfter,uiDeleteRequests:deletes},null,2));
  await second.close();await control.close();await learner.close();
}catch(error){results.push({id:'setup',name:'fixture preparation',result:'FAIL',error:String(error)});console.error(String(error))}
finally{
  writeFileSync(new URL('account-results.json',out),JSON.stringify({results,fixturePreparation:observed,localProviderCalls:calls,realProviderCalls:0,pageErrors:failures},null,2));
  await browser.close();await new Promise(r=>proxy.close(r));await new Promise(r=>provider.close(r));
  if(results.some(r=>r.result==='FAIL')||failures.length)process.exitCode=1;
}
