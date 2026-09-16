// Explicit, disposable local stack only. No provider calls or UAT credentials.
import { chromium, expect } from "@playwright/test";

const origin = process.env.CR033_SMOKE_ORIGIN;
const password = process.env.CR033_SMOKE_PASSWORD;
if (!origin || !/^http:\/\/127\.0\.0\.1:6101$/.test(origin) || !password) {
  throw new Error(
    "Use the dedicated 6101 stack and CR033_SMOKE_PASSWORD. Never target UAT.",
  );
}
const browser = await chromium.launch();
const failures = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addCookies([
  { name: "wordweave_ui_locale", value: "en-US", url: origin },
]);
const page = await context.newPage();
page.on("pageerror", (e) => failures.push(e.message));
page.on("console", (m) => {
  if (/hydration.*mismatch/i.test(m.text())) failures.push(m.text());
});
async function ready() {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}
async function get(path) {
  const r = await context.request.get(origin + path);
  expect(r.status()).toBe(200);
  return r.json();
}
const username = "cr033_learner_" + Date.now();
try {
  await page.goto(origin + "/review");
  await ready();
  await expect(page.locator(".auth-gate h1")).toHaveText(
    "Sign in to open Review",
  );
  await page
    .locator(".auth-gate a")
    .filter({ hasText: /^Create account$/ })
    .click();
  await page.locator("input[autocomplete=username]").fill(username);
  await page.locator("input[type=password]").nth(0).fill(password);
  await page.locator("input[type=password]").nth(1).fill(password);
  let sessionsCreated = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/v1/review/sessions"))
      sessionsCreated++;
  });
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(origin + "/review");
  await expect(page.locator(".auth-gate")).toHaveCount(0);
  await expect(page.locator(".empty-state")).toBeVisible();
  expect(sessionsCreated).toBe(0);
  await page.locator(".identity-pill").click();
  await expect(page).toHaveURL(origin + "/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(origin + "/");
  await page.goto(origin + "/login?redirect=%2Freview");
  await ready();
  await page.locator("input[autocomplete=username]").fill("cr033_admin");
  await page.locator("input[type=password]").fill(password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(origin + "/admin/models");
  const users = await get(
    "/api/v1/admin/users?username=" + username + "&limit=20",
  );
  const userId = users.data.items[0].id;
  expect(users.data.items[0]).not.toHaveProperty("generation_quota");
  const admin = await get("/api/v1/admin/users?username=cr033_admin&limit=20");
  const adminId = admin.data.items[0].id;
  expect(
    (await get("/api/v1/admin/users/" + adminId)).data.user.generation_quota,
  ).toBeNull();
  expect(
    (await get("/api/v1/admin/users/" + userId)).data.user.generation_quota,
  ).toEqual({ kind: "limited", remaining: 5 });
  await page.goto(origin + "/admin/users/" + userId + "?q=" + username);
  await ready();
  const quota = page.locator("dl.definition-list > div").nth(1).locator("dd");
  await expect(quota).toHaveText("5");
  const html = await page.locator("script[data-nuxt-data]").textContent();
  for (const raw of [
    "generation_quota",
    "csrf_token",
    "password_hash",
    "APP_DATABASE_URL",
  ])
    expect(html).not.toContain(raw);
  await expect(page.getByRole("search")).toBeVisible();
  let puts = 0;
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().endsWith("/group")) puts++;
  });
  for (const [plan, kind, remaining, label] of [
    ["plus", "limited", 0, "0"],
    ["pro", "unlimited", null, "Unlimited"],
    ["basic", "limited", 5, "5"],
  ]) {
    await page
      .getByRole("button", { name: "Change plan", exact: true })
      .click();
    await page.locator("dialog select").selectOption(plan);
    const reply = page.waitForResponse(
      (r) => r.request().method() === "PUT" && r.url().endsWith("/group"),
    );
    await page
      .locator("dialog")
      .getByRole("button", { name: "Change plan", exact: true })
      .click();
    const response = await reply;
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.data.user.id).toBe(userId);
    expect(result.data.user.plan_code).toBe(plan);
    expect(result.data.user.generation_quota).toEqual({ kind, remaining });
    expect(result.data.quota_reset).toBe(true);
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(quota).toHaveText(label);
    await page.reload();
    await ready();
    await expect(quota).toHaveText(label);
  }
  expect(puts).toBe(3);
  await page.goto(origin + "/admin/users/" + adminId);
  await ready();
  await expect(quota).toHaveText("—");
  await expect(
    page.getByRole("button", { name: "Change plan", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(origin + "/");
  await page.goto(origin + "/review");
  await ready();
  await expect(page.locator(".auth-gate h1")).toHaveText(
    "Sign in to open Review",
  );
  const guestHtml = await page.locator("script[data-nuxt-data]").textContent();
  expect(guestHtml).not.toContain(username);
  expect(guestHtml).not.toContain("cr033_admin");
  expect(failures).toEqual([]);
  console.log(
    JSON.stringify({
      result: "PASS",
      stack: "real backend + PostgreSQL + Nuxt production + Nginx",
      checks: [
        "registration return without creating review",
        "admin return priority",
        "summary unchanged",
        "GET finite quota",
        "SSR mapped payload",
        "PUT zero/unlimited/finite without reload",
        "SSR refresh each quota",
        "admin null",
        "logout private payload cleanup",
        "no hydration errors",
      ],
      groupPuts: puts,
      providerCalls: 0,
    }),
  );
} finally {
  await browser.close();
}
