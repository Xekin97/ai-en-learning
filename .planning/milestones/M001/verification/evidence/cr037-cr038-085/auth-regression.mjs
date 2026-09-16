import { chromium, expect, request, dir, origin, password, api, register, recorder } from "./lib.mjs";
import { join } from "node:path";

const out = recorder("auth-regression-chromium-darwin");
const browser = await chromium.launch();
const runtime = [];
let serial = 0;
const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
const open = async (page, path) => { await page.goto(origin + path); await ready(page); };
async function context(locale = "en-US", width = 1440) {
  const value = await browser.newContext({ locale, viewport: { width, height: 1000 }, timezoneId: "Asia/Shanghai" });
  value.setDefaultTimeout(10000);
  await value.addCookies([{ name: "wordweave_ui_locale", value: locale, url: origin }]);
  value.on("page", (page) => { page.on("pageerror", (error) => runtime.push(error.message)); });
  return value;
}
async function fill(page, username, registration = false) {
  await page.locator("input[autocomplete=username]").fill(username);
  const fields = page.locator("input[type=password]");
  for (let index = 0; index < (registration ? 2 : 1); index += 1) await fields.nth(index).fill(password);
}

const seed = await request.newContext();
out.record("login fixture register", (await register({ request: seed }, "qa085_auth_login", "en-US")).status, 201);
await seed.dispose();

const hints = {
  "en-US": { "/review": "Continue to Review when you’re done.", "/library": "Continue to Library when you’re done." },
  "zh-CN": { "/review": "完成后返回复习。", "/library": "完成后返回学习记录。" },
};
for (const locale of ["en-US", "zh-CN"]) for (const width of [390, 1440]) {
  const value = await context(locale, width);
  const page = await value.newPage();
  try {
    for (const target of ["/review", "/library"]) {
      await open(page, target);
      const privateGets = [];
      const observe = (request) => { if (request.method() === "GET" && request.url().includes("/api/v1/me/")) privateGets.push(new URL(request.url()).pathname); };
      page.on("request", observe);
      await page.reload(); await ready(page); page.off("request", observe);
      out.record(`${locale} ${width} ${target} visitor private GETs`, privateGets, []);
      await page.locator(".auth-gate .button-primary").click();
      await expect(page).toHaveURL((url) => url.pathname === "/login");
      for (const mode of ["login", "register"]) {
        if (mode === "register") { await page.locator(".auth-alt a").click(); await expect(page).toHaveURL((url) => url.pathname === "/register"); }
        const meta = await page.locator(".auth-card").evaluate((card) => {
          const hint = card.querySelector(".auth-intent"); const title = card.querySelector("h2");
          return { text: hint?.textContent?.trim(), first: card.firstElementChild === hint, beforeTitle: Boolean(hint?.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING), role: hint?.getAttribute("role") };
        });
        out.record(`${locale} ${width} ${target} ${mode} intent`, meta, { text: hints[locale][target], first: true, beforeTitle: true, role: "status" });
        out.record(`${locale} ${width} ${target} ${mode} redirect preserved`, new URL(page.url()).searchParams.get("redirect"), target);
      }
    }
    await open(page, "/login?redirect=%2Freview");
    const originalHint = await page.locator(".auth-intent").innerText();
    await fill(page, "qa085_wrong_login");
    await page.locator("form button[type=submit]").click();
    await expect(page.locator(".app-error")).toBeVisible();
    out.record(`${locale} ${width} wrong-login error inside card`, await page.locator(".auth-card .app-error").count(), 1);
    out.record(`${locale} ${width} wrong-login preserves intent`, await page.locator(".auth-intent").innerText(), originalHint);
  } catch (error) { out.error(`${locale} ${width} ordinary auth intent`, error); }
  finally { await value.close(); }
}

const safeTargets = ["/review", "/library"];
for (const mode of ["login", "register"]) for (const target of [...safeTargets, null, "https://evil.invalid", "/admin/users"]) {
  const value = await context(); const page = await value.newPage(); const writes = [];
  const username = mode === "login" ? "qa085_auth_login" : `qa085_auth_reg_${++serial}`;
  try {
    page.on("request", (req) => { if (req.method() === "POST" && req.url().includes("/review-sessions")) writes.push(req.url()); });
    await open(page, `/${mode}${target ? `?redirect=${encodeURIComponent(target)}` : ""}`);
    await fill(page, username, mode === "register");
    await page.locator("form button[type=submit]").click();
    const expected = safeTargets.includes(target) ? target : "/library";
    await expect(page).toHaveURL(origin + expected);
    out.record(`${mode} ${target || "direct"} destination`, new URL(page.url()).pathname, expected);
    out.record(`${mode} ${target || "direct"} no automatic review`, writes, []);
  } catch (error) { out.error(`${mode} ${target || "direct"} auth flow`, error); }
  finally { await value.close(); }
}

{
  const value = await context("zh-CN"); const page = await value.newPage();
  try {
    await open(page, "/login?redirect=%2Freview"); await fill(page, "qa085_admin");
    await page.locator("form button[type=submit]").click(); await expect(page).toHaveURL(origin + "/admin/models");
    out.record("admin role redirect priority", new URL(page.url()).pathname, "/admin/models");
  } catch (error) { out.error("admin role redirect", error); }
  finally { await value.close(); }
}

for (const locale of ["en-US", "zh-CN"]) for (const width of [390, 1440]) {
  const value = await context(locale, width); const page = await value.newPage();
  const key = `claim ${locale} ${width}`; const seen = []; const claim = `qa085_claim_${locale}_${width}`; const generation = `qa085_generation_${locale}_${width}`;
  const envelope = (data) => ({ data, meta: { request_id: "req_qa085_claim" } });
  try {
    await page.route("**/api/v1/generation-options", (route) => route.fulfill({ json: envelope({ models: [{ id: "mdl_qa085_fixture", name: "QA fixture", description: "Contract-only resource" }], meaning_languages: ["en"], scenarios: ["discussion"], lengths: ["short"], max_entries: 5, availability: { can_generate: true, reason: null }, quota: { kind: "limited", limit: 5, remaining: 5, window_hours: 24, refreshes_at: null } }) }));
    await page.route("**/api/v1/vocabulary/search?*", (route) => route.fulfill({ json: envelope({ items: [{ entry: "adapt" }], vocabulary_version: "qa085-fixture" }) }));
    const passage = "Teams adapt quickly when the context changes.";
    const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
    await page.route("**/api/v1/generations/stream", (route) => { seen.push("stream"); return route.fulfill({ contentType: "text/event-stream", headers: { "cache-control": "no-store" }, body: event("generation.started", { run_id: "gen_qa085_fixture", generation_token: generation }) + event("passage.delta", { text: passage }) + event("generation.validated", { run_id: "gen_qa085_fixture", result: { passage, tags: ["Adaptation"], targets: [{ entry: "adapt", contextual_meaning: "to adjust", hint_phrase: "adapt to change", hint_blanks: [{ start: 0, end: 5 }], occurrences: [{ surface: "adapt", start: 6, end: 11 }] }] } }) }); });
    await page.route("**/api/v1/generations/gen_qa085_fixture/visitor-claim", (route) => { seen.push("claim"); out.record(`${key} generation token`, route.request().headers()["x-generation-token"], generation); return route.fulfill({ json: envelope({ claim_token: claim, expires_at: new Date(Date.now() + 1800000).toISOString() }) }); });
    await open(page, "/"); await page.locator('main a.button-primary[href="/create"]').click();
    await page.locator("#word-search").fill("adapt"); await page.locator("#word-search-results button").click();
    for (const selector of [".choice-grid-model", ".choice-grid-3", ".choice-grid-scenario", ".choice-grid-4"]) await page.locator(`${selector} .choice`).first().click();
    await page.locator(".generate-bar button").click(); await expect(page.locator(".result-action-bar .button-primary")).toBeVisible();
    await page.locator(".result-action-bar .button-primary").click(); await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("claim") === "1");
    for (const mode of ["login", "register"]) {
      if (mode === "register") await page.locator(".auth-alt a").click();
      out.record(`${key} ${mode} warning first`, await page.locator(".auth-card").evaluate((card) => card.firstElementChild.matches(".notice-warning")), true);
      out.record(`${key} ${mode} ordinary hint absent`, await page.locator(".auth-intent").count(), 0);
    }
    await page.locator(".auth-alt a").click(); out.record(`${key} roundtrip keeps claim`, await page.locator(".notice-warning").count(), 1);
    out.record(`${key} pipeline`, seen, ["stream", "claim"]);
    out.record(`${key} tokens not persisted`, await page.evaluate((values) => values.some((v) => location.href.includes(v) || [...Object.values(localStorage), ...Object.values(sessionStorage)].some((x) => x.includes(v))), [claim, generation]), false);
    await page.reload(); await ready(page);
    out.record(`${key} refresh clears memory claim`, await page.locator(".notice-warning").count(), 0);
    out.record(`${key} refresh falls back to ordinary Library intent`, await page.locator(".auth-intent").count(), 1);
    await page.screenshot({ path: join(dir, `qa085-${locale}-${width}-claim-refresh.png`), fullPage: true });
  } catch (error) { out.error(key, error); }
  finally { await value.close(); }
}

out.record("browser page errors", runtime, []);
await browser.close();
out.save({ origin, claimBoundary: "contract fixtures exercise frontend DTO-to-state-to-render pipeline; not AI evaluation" });
