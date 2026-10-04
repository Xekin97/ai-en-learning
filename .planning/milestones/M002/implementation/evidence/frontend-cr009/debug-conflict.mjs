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
const reads=[];
page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/v1/admin/models'){const b=await r.json().catch(()=>null);reads.push({status:r.status(),code:b?.code,ids:b?.data?.items?.map(x=>x.id),hasMore:b?.meta?.has_more})}});
try{
 await ok(admin,'/auth/login','POST',{username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 const models=[];let cursor;
 do{const r=await call(admin,'/admin/models?limit=20'+(cursor?'&cursor='+encodeURIComponent(cursor):''));models.push(...r.body.data.items);cursor=r.body.meta.next_cursor}while(cursor);
 const a=models.find(m=>!m.retired_at),z=models.slice(40).find(m=>!m.retired_at);if(!z)throw Error('Needs later-page model');
 const card=(await ok(admin,'/admin/growth/items','POST',{kind:'model_trial',name:{zh_CN:null,en_US:'Debug conflict '+Date.now()},description:{zh_CN:null,en_US:'Conflict diagnostic'},exchange_price:'5',activation_ttl_seconds:2592000,effect:{kind:'model_trial',model_ids:[a.id],trial_seconds:259200,retirement_points:'20'}})).item;
 await edit(card.name.en_US);await expect(select()).toBeEnabled();await dialog.getByLabel(t('retirementpoints'),{exact:true}).fill('81');
 const current=await ok(admin,'/admin/growth/items/'+card.id);const update=input(current.item,'90');update.effect.model_ids=[a.id,z.id];await ok(admin,'/admin/growth/items/'+card.id,'PUT',{...update,expected_revision:current.revision});
 const impact=await ok(admin,'/admin/models/'+z.id+'/removal-impact');await ok(admin,'/admin/models/'+z.id,'DELETE',{expected_revision:impact.revision,confirmation_token:impact.confirmation_token,confirmed:true});
 await save();await page.waitForTimeout(1500);const state={a:a.id,z:z.id,reads,text:await dialog.innerText(),selected:await selection(),options:await select().locator('option').evaluateAll(os=>os.map(o=>({value:o.value,text:o.textContent}))),disabled:await select().isDisabled()};
 writeFileSync(join(out,'debug.json'),JSON.stringify(state,null,2));console.log(JSON.stringify({a:state.a,z:state.z,reads,text:state.text,disabled:state.disabled},null,2));await page.screenshot({path:join(out,'debug.png'),fullPage:true});
}finally{await browser.close();await new Promise(r=>proxy.close(r))}
