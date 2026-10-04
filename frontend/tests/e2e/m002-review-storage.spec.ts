import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const source = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002/design/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const t = (key: string) =>
  (source.static[`en.${key}`] ?? source.templates[`en.${key}`]) as string;
const ready = (page: Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
async function fault(page: Page, value: "all" | "write" | null) {
  await page.evaluate((value) => {
    Reflect.set(window, "__reviewStorageFault", value);
  }, value);
}
async function records(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = indexedDB.open("wordweave-review-drafts", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("drafts", "readonly");
          const rows = tx.objectStore("drafts").getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(rows.result);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}
async function start(page: Page) {
  await page.goto("/library/batch-e2e");
  await ready(page);
  await page.getByRole("button", { name: t("l.single"), exact: true }).click();
  await expect(page.locator(".slot")).toHaveCount(5);
}
const retry = (page: Page) =>
  page
    .getByRole("alert")
    .filter({ hasText: t("failed") })
    .getByRole("button", { name: t("retry"), exact: true });
const warning = (page: Page) =>
  page.getByRole("alert").filter({ hasText: t("failed") });

test.beforeEach(async ({ context, request }) => {
  await request.post("http://127.0.0.1:38080/api/v1/__test/review-reset");
  await context.addCookies([
    {
      name: "wordweave_session",
      value: "learner",
      url: "http://127.0.0.1:3332",
    },
  ]);
  await context.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      if (
        args[0] === "wordweave-review-drafts" &&
        Reflect.get(window, "__reviewStorageFault") === "all"
      )
        throw new DOMException(
          "Storage denied for regression",
          "SecurityError",
        );
      return open.apply(this, args);
    };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (
        this.name === "wordweave-review-drafts" &&
        args[1] === "readwrite" &&
        Reflect.get(window, "__reviewStorageFault") === "write"
      )
        queueMicrotask(() => tx.abort());
      return tx;
    };
  });
});

test("denied storage preserves editing and submits the latest memory answers; cleanup retries and summary is one-time", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Reflect.set(window, "__reviewStorageFault", "all");
  });
  await start(page);
  await expect(warning(page)).toBeVisible();
  await page.locator(".slot").first().fill("x");
  await retry(page).click();
  await expect(page.locator(".slot").first()).toHaveValue("x");
  await page.getByRole("button", { name: t("next"), exact: true }).click();
  await page.locator(".gap").fill("wrong");
  await page.getByRole("button", { name: t("next"), exact: true }).click();
  await expect(page.locator(".answer-link").first()).toHaveText("x");
  await page.locator(".answer-link").first().click();
  await page.locator(".slot").first().fill("y");
  await page.getByRole("button", { name: t("next"), exact: true }).click();
  await expect(page.locator(".answer-link").first()).toHaveText("y");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("memory-overview.png"),
    fullPage: true,
  });
  const submitted = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/submit"),
  );
  await page.getByRole("button", { name: t("submit"), exact: true }).click();
  expect((await submitted).postDataJSON()).toMatchObject({
    words: [{ answer: "y" }],
    passage: [{ answer: "wrong" }],
  });
  await expect(page.locator(".result-word .bad").first()).toHaveText("y");
  await expect(warning(page)).toBeVisible();
  await fault(page, null);
  await retry(page).click();
  await expect(warning(page)).toHaveCount(0);
  expect(await records(page)).toEqual([]);
  await page.reload();
  await ready(page);
  await expect(page.locator(".result-word")).toHaveCount(0);
  await expect(
    page.getByText(t("l.summary.unavailable"), { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("a failed write retains current input and persists it on retry for confirmed restoration", async ({
  page,
}) => {
  await start(page);
  await page.locator(".slot").first().fill("a");
  await expect
    .poll(async () => (await records(page))[0]?.wordInputs)
    .toEqual({ "q-opaque": ["a", "", "", "", ""] });
  await fault(page, "write");
  await page.locator(".slot").first().fill("b");
  await expect(warning(page)).toBeVisible();
  await retry(page).click();
  await expect(page.locator(".slot").first()).toHaveValue("b");
  expect((await records(page))[0]?.wordInputs).toEqual({
    "q-opaque": ["a", "", "", "", ""],
  });
  await fault(page, null);
  await retry(page).click();
  await expect(warning(page)).toHaveCount(0);
  await page.reload();
  await ready(page);
  await expect(page.locator("dialog[open]")).toBeVisible();
  await expect(page.locator(".slot")).toHaveCount(0);
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("resume"), exact: true })
    .click();
  await expect(page.locator(".slot").first()).toHaveValue("b");
});

test("recovering a failed read never overwrites an existing draft before restore confirmation", async ({
  page,
}) => {
  await start(page);
  await page.locator(".slot").first().fill("a");
  await expect.poll(async () => (await records(page)).length).toBe(1);
  await page.addInitScript(() => {
    Reflect.set(window, "__reviewStorageFault", "all");
  });
  await page.reload();
  await ready(page);
  await expect(page.locator(".slot")).toHaveCount(5);
  await page.locator(".slot").first().fill("b");
  await expect(warning(page)).toBeVisible();
  await fault(page, null);
  await retry(page).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  expect((await records(page))[0]?.wordInputs).toEqual({
    "q-opaque": ["a", "", "", "", ""],
  });
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: t("resume"), exact: true })
    .click();
  await expect(page.locator(".slot").first()).toHaveValue("a");
});

test("an unknown draft schema is protected until explicit restart", async ({
  page,
}) => {
  await start(page);
  await page.locator(".slot").first().fill("a");
  await expect.poll(async () => (await records(page)).length).toBe(1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("wordweave-review-drafts", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("drafts", "readwrite");
          const cursor = tx.objectStore("drafts").openCursor();
          cursor.onsuccess = () => {
            if (cursor.result)
              cursor.result.update({
                ...cursor.result.value,
                schemaVersion: 2,
              });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
        request.onerror = () => reject(request.error);
      }),
  );
  await page.reload();
  await ready(page);
  await expect(warning(page)).toBeVisible();
  await expect(page.locator(".slot")).toHaveCount(0);
  await retry(page).click();
  expect((await records(page))[0]?.schemaVersion).toBe(2);
  await page.getByRole("button", { name: t("restart"), exact: true }).click();
  await expect(page.locator(".slot")).toHaveCount(5);
  await expect(page.locator(".slot").first()).toHaveValue("");
  expect(await records(page)).toEqual([]);
});
