import { test, expect } from "@playwright/test";
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
const ready = (page: import("@playwright/test").Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
for (const lang of ["en", "zh"]) {
  const locale = lang === "en" ? "en-US" : "zh-CN";
  const t = (key: string) =>
    (source.static[lang + "." + key] ??
      source.templates[lang + "." + key]) as string;
  test.describe("UAT23 " + lang, () => {
    test.beforeEach(async ({ context, baseURL }) => {
      await context.addCookies([
        { name: "wordweave_ui_locale", value: locale, url: baseURL! },
      ]);
      await context.route("**/api/v1/auth/login", async (route) => {
        const response = await route.fetch(),
          json = await response.json();
        if (response.status() === 200) json.data.ui_locale = locale;
        await route.fulfill({ response, json });
      });
    });
    test("authentication errors retain actionable text and use a compact outline icon", async ({
      page,
    }) => {
      await page.goto("/login");
      await ready(page);
      await page.locator('input[autocomplete="username"]').fill("learner_e2e");
      await page.locator('input[type="password"]').fill("WrongPass123!");
      await page.locator('form button[type="submit"]').click();
      const error = page.locator(".app-error");
      await expect(error).toBeVisible();
      await expect(error).toHaveAttribute("role", "alert");
      expect(await error.innerText()).not.toBe("");
      const styles = await error.evaluate((el) => {
        const icon = el.querySelector("svg")!,
          path = icon.querySelector("path")!,
          text = el.querySelector("div")!;
        return {
          fill: getComputedStyle(path).fill,
          stroke: getComputedStyle(path).stroke,
          color: getComputedStyle(el).color,
          width: icon.getBoundingClientRect().width,
          aligned:
            icon.getBoundingClientRect().right <=
            text.getBoundingClientRect().left,
          height: el.getBoundingClientRect().height,
        };
      });
      expect(styles.fill).toBe("none");
      expect(styles.stroke).toBe(styles.color);
      expect(styles.width).toBe(20);
      expect(styles.aligned).toBe(true);
      expect(styles.height).toBeLessThan(110);
      await expect(page.locator('input[autocomplete="username"]')).toHaveValue(
        "learner_e2e",
      );
      await expect(page.locator('input[type="password"]')).toHaveValue("");
      await page.route("**/api/v1/auth/register", (route) =>
        route.fulfill({
          status: 409,
          json: {
            type: "https://wordweave.example/problems/username_unavailable",
            title: "Username unavailable",
            status: 409,
            code: "username_unavailable",
            detail: "Choose another username.",
            request_id: "uat23-register-conflict",
          },
        }),
      );
      await page.locator('.auth-form a[href^="/register"]').click();
      await expect(page).toHaveURL(/\/register/);
      await expect(
        page.locator('input[autocomplete="new-password"]'),
      ).toHaveCount(2);
      await page.locator('input[autocomplete="username"]').fill("learner_e2e");
      for (const input of await page.locator('input[type="password"]').all())
        await input.fill("CorrectPass123!");
      await page.locator('form button[type="submit"]').click();
      await expect(error).toBeVisible();
      await expect(error.locator("svg")).toHaveAttribute("fill", "none");
    });
    test("review and library go directly to authentication and return after login", async ({
      page,
    }) => {
      const privateRequests: string[] = [];
      page.on("request", (r) => {
        if (
          /\/me\/(learning-summary|batches|review-range|review-sessions)/.test(
            r.url(),
          )
        )
          privateRequests.push(r.url());
      });
      for (const target of ["/library", "/review"]) {
        await page.goto(target);
        await expect(page).toHaveURL(
          (u) =>
            u.pathname === "/login" &&
            u.searchParams.get("redirect") === target,
        );
        await ready(page);
        await expect(page.locator(".auth-gate")).toHaveCount(0);
        await expect(
          page.locator('.auth-form input[autocomplete="username"]'),
        ).toBeVisible();
        await page.locator('.auth-form a[href^="/register"]').click();
        await expect(page).toHaveURL(
          (u) =>
            u.pathname === "/register" &&
            u.searchParams.get("redirect") === target,
        );
        await page.locator('.auth-form a[href^="/login"]').click();
        await expect(page).toHaveURL(
          (u) =>
            u.pathname === "/login" &&
            u.searchParams.get("redirect") === target,
        );
      }
      expect(privateRequests).toEqual([]);
      await page.locator('input[autocomplete="username"]').fill("learner_e2e");
      await page.locator('input[type="password"]').fill("CorrectPass123!");
      await page.locator('form button[type="submit"]').click();
      await expect(page).toHaveURL(/\/review$/);
      await expect(page.locator(".range-editor")).toBeVisible();
    });
    test("plan fields match the approved groups and persist confirmed edits", async ({
      page,
      context,
      request,
      baseURL,
    }) => {
      await request.post("/api/v1/__test/admin-reset");
      await context.addCookies([
        { name: "wordweave_session", value: "admin", url: baseURL! },
      ]);
      await page.goto("/admin/plans");
      await ready(page);
      const groups = page.locator("form.panel .admin-options");
      await expect(groups).toHaveCount(2);
      await expect(groups.nth(1).locator("label")).toHaveCount(4);
      const layout = await page.locator("form.panel").evaluate((el) => {
        const columns = [...el.querySelectorAll(".form-grid > div")].map((c) =>
          c.getBoundingClientRect(),
        );
        const rows = [...el.querySelectorAll(".admin-options label")].map(
          (label) => ({
            box: label.getBoundingClientRect(),
            input: label.querySelector("input")!.getBoundingClientRect(),
            text: label.querySelector("span")!.getBoundingClientRect(),
          }),
        );
        return {
          desktop: innerWidth > 760,
          sideBySide: columns[1]!.left > columns[0]!.right,
          stacked: columns[1]!.top >= columns[0]!.bottom,
          aligned: rows.every(
            (r) =>
              r.input.right < r.text.left && r.box.height >= r.input.height,
          ),
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(layout.overflow).toBe(false);
      expect(layout.aligned).toBe(true);
      expect(layout.desktop ? layout.sideBySide : layout.stacked).toBe(true);
      await page.getByLabel(t("words.limit"), { exact: true }).fill("17");
      await page
        .getByRole("checkbox", { name: t("a.length.long"), exact: true })
        .check();
      await page
        .locator("form.panel")
        .getByRole("button", { name: t("a.save"), exact: true })
        .click();
      await expect(page.locator("#plan-impact[open]")).toBeVisible();
      await page
        .locator("#plan-impact")
        .getByRole("button", { name: t("a.save"), exact: true })
        .click();
      await expect(page.locator("#plan-impact")).not.toBeVisible();
      await page.reload();
      await ready(page);
      await expect(
        page.getByLabel(t("words.limit"), { exact: true }),
      ).toHaveValue("17");
      await expect(
        page.getByRole("checkbox", { name: t("a.length.long"), exact: true }),
      ).toBeChecked();
    });
    test("login reminders preserve prototype hierarchy, pagination and welcome layer", async ({
      page,
    }) => {
      const notices = [1, 2].map((i) => ({
        id: "uat23-notice-" + i,
        title:
          lang === "zh" ? "本周学习提醒 " + i : "This week's learning " + i,
        body_html:
          "<h2>Keep learning</h2><p>A little practice every day.</p><ul><li>Read a story</li><li>Review your words</li></ul>",
        content_locale: locale,
        remind: true,
        published_at: "2026-09-20T01:00:00Z",
        revision: "notice-revision-" + i,
      }));
      await page.route("**/api/v1/notices**", (route) => {
        const id = new URL(route.request().url()).pathname.split("/").at(-1);
        return route.fulfill({
          json:
            id === "notices"
              ? {
                  data: { items: notices },
                  meta: {
                    request_id: "uat23-notices",
                    next_cursor: null,
                    has_more: false,
                  },
                }
              : {
                  data: { notice: notices.find((n) => n.id === id) },
                  meta: { request_id: "uat23-notice" },
                },
        });
      });
      await page.goto("/login");
      await ready(page);
      await page.locator('input[autocomplete="username"]').fill("learner_e2e");
      await page.locator('input[type="password"]').fill("CorrectPass123!");
      await page.locator('form button[type="submit"]').click();
      const dialog = page.locator("#platform-notice");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(":scope > h2")).toHaveText(
        t("notices.title"),
      );
      await expect(dialog.locator(".notice-meta")).toContainText("1 / 2");
      await expect(dialog.locator("time")).toHaveAttribute(
        "datetime",
        notices[0]!.published_at,
      );
      await expect(dialog.locator("time")).toHaveText("2026-09-20");
      await expect(dialog.locator(".dialog-close")).toHaveText(t("close"));
      await expect(dialog.locator(".dialog-body > h3")).toHaveText(
        notices[0]!.title,
      );
      await expect(dialog.locator(".markdown h2")).toHaveText("Keep learning");
      await expect(dialog.locator(".dialog-actions .btn")).toHaveText([
        t("previous"),
        t("next"),
        t("close"),
      ]);
      await expect(
        dialog.getByRole("button", { name: t("previous"), exact: true }),
      ).toBeDisabled();
      await expect(dialog.locator(".dialog-actions .primary")).toHaveText(
        t("close"),
      );
      await expect(page.locator('[role="status"][popover]')).toBeVisible();
      expect(
        await page
          .locator('[role="status"][popover]')
          .evaluate(
            (el) =>
              el.matches(":popover-open") &&
              document.querySelector("#platform-notice")!.contains(el),
          ),
      ).toBe(true);
      await dialog
        .getByRole("button", { name: t("next"), exact: true })
        .click();
      await expect(dialog.locator(".notice-meta")).toContainText("2 / 2");
      await expect(dialog.locator(".dialog-body > h3")).toHaveText(
        notices[1]!.title,
      );
      await expect(
        dialog.getByRole("button", { name: t("next"), exact: true }),
      ).toBeDisabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(page.locator('[role="status"][popover]')).toBeVisible();
    });
  });
}
