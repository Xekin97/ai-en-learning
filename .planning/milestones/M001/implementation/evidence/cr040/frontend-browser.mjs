import { createServer, request as upstreamRequest } from "node:http";
import { pathToFileURL } from "node:url";
import { once } from "node:events";

const { chromium, expect } = await import(
  pathToFileURL(process.cwd() + "/frontend/node_modules/@playwright/test/index.mjs")
);
const frontendOrigin = process.env.CR040_FRONTEND_ORIGIN;
if (!frontendOrigin || new URL(frontendOrigin).hostname !== "127.0.0.1")
  throw new Error("Explicit isolated loopback frontend required");
const proxy = createServer((request, response) => {
  const origin = request.url.startsWith("/api/v1") ? "http://127.0.0.1:38080" : frontendOrigin;
  const upstream = upstreamRequest(new URL(request.url, origin), {
    method: request.method, headers: request.headers,
  }, (incoming) => {
    response.writeHead(incoming.statusCode, incoming.headers);
    incoming.pipe(response);
  });
  upstream.on("error", () => { response.writeHead(502); response.end(); });
  request.pipe(upstream);
});
proxy.listen(0, "127.0.0.1");
await once(proxy, "listening");
const origin = "http://127.0.0.1:" + proxy.address().port;
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const locale of ["en-US", "zh-CN"]) {
    const context = await browser.newContext();
    await context.addCookies([
      { name: "wordweave_session", value: "learner", url: origin },
      { name: "wordweave_ui_locale", value: locale, url: origin },
    ]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(origin + "/library/batch-e2e");
    const html = await response.text();
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    await expect(page.locator("main")).toContainText("change to fit a new situation");
    if (!html.includes("change to fit a new situation") || html.includes('"entry_meaning"'))
      throw new Error("SSR failed to use the application projection");
    checks.push({ locale, case: "library SSR/hydration current meaning", result: "PASS" });

    await page.goto(origin + "/review/session-single");
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    await expect(page.locator("main")).toContainText("change to fit a new situation");
    checks.push({ locale, case: "review spelling meaning", result: "PASS" });
    await context.addCookies([{ name: "wordweave_session", value: "admin", url: origin }]);
    await page.goto(origin + "/admin/users/user-e2e?batch=batch-e2e");
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    await expect(page.locator("dialog")).toContainText("change to fit a new situation");
    checks.push({ locale, case: "admin read-only reader meaning", result: "PASS" });
    if (errors.length) throw new Error("browser runtime error: " + errors[0]);
    await context.close();
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin + "/create");
  await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
  await page.locator("#word-search").fill("ada");
  await page.locator(".word-search-overlay").getByRole("option", { name: "adapt", exact: true }).click();
  await page.locator(".choice-grid-model button.choice").first().click();
  await page.locator(".choice-grid-3 button.choice").filter({ hasText: "English" }).click();
  await page.locator(".choice-grid-scenario button.choice").filter({ hasText: "Story" }).click();
  await page.locator(".choice-grid-4 button.choice").filter({ hasText: "Brief" }).click();
  await page.locator(".generate-bar .button-primary").click();
  await expect(page.locator("main")).toContainText("change to fit a new situation");
  checks.push({ locale: "en-US", case: "generation SSE current meaning", result: "PASS" });
  await context.close();
  console.log(JSON.stringify({ result: "PASS", checks, real_model_calls: 0, mode: "production frontend plus synthetic contract mock" }, null, 2));
} finally {
  await browser.close();
  proxy.closeAllConnections();
  await new Promise((resolve) => proxy.close(resolve));
}
