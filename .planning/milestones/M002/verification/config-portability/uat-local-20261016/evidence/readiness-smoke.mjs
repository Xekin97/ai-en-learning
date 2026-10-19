import { chromium } from "/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/node_modules/@playwright/test/index.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";

const origin = "http://localhost:3016";
const username = process.env.WORDWEAVE_UAT_ADMIN_USERNAME;
const password = process.env.WORDWEAVE_UAT_ADMIN_PASSWORD;
const plansPackage = process.env.WORDWEAVE_UAT_PLANS_PACKAGE;
if (!username || !password || !plansPackage) throw new Error("missing private UAT inputs");

const evidenceDir = new URL("./", import.meta.url).pathname;
const downloadDir = "/private/tmp/wordweave-m002-cr313-uat-20261016/readiness-downloads";
await mkdir(downloadDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
const result = {
  version: "M002-CR313-UAT-LOCAL-20261016",
  origin,
  login: null,
  routes: [],
  exports: [],
  previewCancel: null,
  screenshot: "models-ready.png",
  providerCalls: 0,
  status: "FAIL",
};

async function currentRevision(category) {
  return page.evaluate(async (path) => {
    const response = await fetch(path, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`current ${response.status}`);
    const body = await response.json();
    return body.data?.revision ?? body.revision;
  }, `/api/v1/admin/config-portability/${category}/current`);
}

async function exportCategory(route, category, tabName) {
  await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
  if (tabName) await page.getByRole("button", { name: tabName, exact: true }).click();
  const importer = page.getByRole("button", { name: "Import configuration", exact: true });
  const exporter = page.getByRole("button", { name: "Export configuration", exact: true });
  await importer.waitFor();
  await exporter.waitFor();
  result.routes.push({ route, category, importEntry: true, exportEntry: true, tab: tabName ?? null });
  await exporter.click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Prepare download", exact: true }).click();
  const download = await downloadPromise;
  const target = `${downloadDir}/${category}.json`;
  await download.saveAs(target);
  const bytes = await readFile(target);
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (category === "models" && /api[_-]?key/i.test(bytes.toString("utf8"))) {
    throw new Error("ordinary models export contains an API-key field");
  }
  result.exports.push({
    category,
    status: "PASS",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    topLevelKeys: Object.keys(parsed).sort(),
    suggestedFilename: download.suggestedFilename(),
  });
  await page.keyboard.press("Escape");
  await page.locator("#cr313-dialog").waitFor({ state: "hidden" });
}

try {
  await page.goto(`${origin}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== "/login"),
    page.locator('form button[type="submit"]').click(),
  ]);
  result.login = { method: "normal browser form", role: "admin", status: "PASS" };

  await exportCategory("/admin/models", "models");
  await page.screenshot({ path: `${evidenceDir}/models-ready.png`, fullPage: false });
  await exportCategory("/admin/plans", "plans");
  await exportCategory("/admin/growth", "items", "Items");
  await exportCategory("/admin/growth", "growth", "Check-in rules");

  await page.goto(`${origin}/admin/plans`, { waitUntil: "networkidle" });
  const revisionBefore = await currentRevision("plans");
  await page.getByRole("button", { name: "Import configuration", exact: true }).click();
  await page.locator("#cr313-dialog input[type=file]").setInputFiles(plansPackage);
  await page.getByRole("button", { name: "Decrypt and validate", exact: true }).click();
  await page.getByRole("button", { name: "Continue to confirmation", exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator("#cr313-dialog").waitFor({ state: "hidden" });
  const revisionAfter = await currentRevision("plans");
  if (revisionAfter !== revisionBefore) throw new Error("preview/cancel changed revision");
  result.previewCancel = {
    category: "plans",
    previewReached: true,
    cancelled: true,
    revisionUnchanged: true,
    revision: revisionBefore,
    importSubmitted: false,
    status: "PASS",
  };
  result.status = "PASS";
} catch (error) {
  result.failure = String(error?.stack ?? error);
} finally {
  await browser.close();
  await rm(downloadDir, { recursive: true, force: true });
}

console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
