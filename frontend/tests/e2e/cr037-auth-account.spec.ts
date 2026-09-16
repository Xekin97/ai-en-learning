import { expect, test, type Page } from "@playwright/test";

const origin = "http://127.0.0.1:3300";
async function actor(page: Page, role: "visitor" | "learner", locale: string) {
  await page
    .context()
    .addCookies([
      { name: "wordweave_ui_locale", value: locale, url: origin },
      ...(role === "learner"
        ? [{ name: "wordweave_session", value: role, url: origin }]
        : []),
    ]);
}
async function ready(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}
async function leadingHint(page: Page, text: string) {
  const hint = page.locator(".auth-intent");
  await expect(hint).toHaveText(text);
  await expect(hint).toHaveAttribute("role", "status");
  expect(
    await hint.evaluate((element) => {
      const title = element.parentElement!.querySelector("h2")!;
      return {
        first: element.parentElement!.firstElementChild === element,
        precedesTitle: Boolean(
          element.compareDocumentPosition(title) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        aboveTitle:
          element.getBoundingClientRect().bottom <=
          title.getBoundingClientRect().top,
      };
    }),
  ).toEqual({ first: true, precedesTitle: true, aboveTitle: true });
  await expect(hint).toHaveCSS("margin-bottom", "20px");
}
for (const locale of ["en-US", "zh-CN"]) {
  const en = locale === "en-US";
  test(
    "CR037 auth hint precedes headings through safe target round trips: " +
      locale,
    async ({ page }) => {
      test.setTimeout(90_000);
      await actor(page, "visitor", locale);
      for (const [path, copy] of [
        [
          "/review",
          en ? "Continue to Review when you’re done." : "完成后返回复习。",
        ],
        [
          "/review/session-e2e?batch=batch-e2e",
          en ? "Continue to Review when you’re done." : "完成后返回复习。",
        ],
        [
          "/library",
          en ? "Continue to Library when you’re done." : "完成后返回学习记录。",
        ],
        [
          "/library/batch-e2e",
          en
            ? "Return to this story when you’re done."
            : "完成后返回这篇短文。",
        ],
        [
          "/account",
          en ? "Continue to Account when you’re done." : "完成后返回账号设置。",
        ],
      ]) {
        await page.goto(path!);
        await ready(page);
        await page.locator(".auth-gate .button-primary").click();
        await expect(page).toHaveURL((url) => url.pathname === "/login");
        await ready(page);
        await leadingHint(page, copy!);
        expect(new URL(page.url()).searchParams.get("redirect")).toBe(path);
        await page.locator(".auth-alt a").click();
        await expect(page).toHaveURL((url) => url.pathname === "/register");
        await ready(page);
        await leadingHint(page, copy!);
        expect(new URL(page.url()).pathname).toBe("/register");
        expect(new URL(page.url()).searchParams.get("redirect")).toBe(path);
        await page.reload();
        await ready(page);
        await leadingHint(page, copy!);
        await page.locator(".auth-alt a").click();
        await expect(page).toHaveURL((url) => url.pathname === "/login");
        await ready(page);
        await leadingHint(page, copy!);
      }
      await page.locator('input[autocomplete="username"]').fill("learner_e2e");
      await page
        .locator('input[autocomplete="current-password"]')
        .fill("WrongPass123!");
      await page.locator("form button[type=submit]").click();
      await expect(page.locator(".app-error")).toBeVisible();
      await leadingHint(
        page,
        en ? "Continue to Account when you’re done." : "完成后返回账号设置。",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    },
  );
  test(
    "CR037 no intent and stale claims preserve normal auth layout: " + locale,
    async ({ page }) => {
      await actor(page, "visitor", locale);
      for (const route of ["/login", "/register"]) {
        for (const suffix of ["", "?redirect=https%3A%2F%2Foutside.example"]) {
          await page.goto(route + suffix);
          await ready(page);
          await expect(page.locator(".auth-intent")).toHaveCount(0);
          expect(
            await page
              .locator(".auth-card")
              .evaluate((card) => card.firstElementChild?.tagName),
          ).toBe("H2");
        }
        await page.goto(route + "?claim=1&redirect=%2Freview");
        await ready(page);
        await expect(page.locator(".notice-warning")).toHaveCount(0);
        await leadingHint(
          page,
          en ? "Continue to Review when you’re done." : "完成后返回复习。",
        );
      }
    },
  );
  test(
    "CR037 password dialog error, retry, cleanup, copy and shared helper: " +
      locale,
    async ({ page, browserName }) => {
      await actor(page, "learner", locale);
      await page.goto("/account");
      await ready(page);
      const trigger = page.locator(
        ".settings-grid .card-footer .button-secondary",
      );
      const writes: unknown[] = [];
      let releaseSuccessfulRetry!: () => void;
      const successfulRetry = new Promise<void>((resolve) => {
        releaseSuccessfulRetry = resolve;
      });
      await page.route("**/api/v1/me/password", async (route) => {
        const body = route.request().postDataJSON();
        writes.push(body);
        if (body.current_password !== "CorrectPass123!") {
          await route.fulfill({
            status: 422,
            contentType: "application/problem+json",
            body: JSON.stringify({
              type: "about:blank",
              title: "Invalid password",
              status: 422,
              code: "validation_failed",
              detail: "The current password is incorrect.",
              request_id: "req-password-invalid",
              field_errors: [{ field: "current_password", code: "incorrect" }],
            }),
          });
          return;
        }
        await successfulRetry;
        await route.fulfill({ status: 204 });
      });
      await trigger.click();
      const dialog = page.locator("dialog[open]");
      await expect(dialog.locator("h2")).toHaveText(
        en ? "Change password" : "修改密码",
      );
      await expect(dialog.locator(".field-label")).toHaveText(
        en
          ? ["Current password", "New password", "Confirm new password"]
          : ["当前密码", "新密码", "确认新密码"],
      );
      await expect(dialog.locator(".helper")).toHaveText(
        en
          ? [
              "Confirm it’s you",
              "8–128 characters",
              "Enter the same password again",
            ]
          : ["用于确认是账号本人", "8–128 个字符", "再次输入相同密码"],
      );
      await expect(dialog.locator(".notice")).toHaveText(
        en
          ? "Your current session will stay open. Other sessions will be signed out."
          : "修改成功后保留当前会话，其他已有会话全部退出。",
      );
      await expect(dialog.locator(".dialog-footer button")).toHaveText(
        en ? ["Cancel", "Update password"] : ["取消", "确认修改"],
      );
      const inputs = dialog.locator('input[type="password"]'),
        submit = dialog.locator('button[type="submit"]');
      await expect(submit).toBeDisabled();
      await inputs.nth(0).fill("CurrentPass123!");
      await inputs.nth(1).fill("UpdatedPass123!");
      await inputs.nth(2).fill("MismatchPass123!");
      await expect(submit).toBeDisabled();
      await inputs.nth(2).fill("UpdatedPass123!");
      await expect(submit).toBeEnabled();
      await dialog.locator(".button-secondary").click();
      await expect(page.locator("dialog")).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(writes).toEqual([]);
      await trigger.click();
      for (let i = 0; i < 3; i++) await expect(inputs.nth(i)).toHaveValue("");
      await inputs.nth(0).fill("WrongPass123!");
      await inputs.nth(1).fill("UpdatedPass123!");
      await inputs.nth(2).fill("UpdatedPass123!");
      await submit.click();
      const passwordError = dialog.locator(".app-error");
      await expect(passwordError).toHaveText(
        en ? "Check the information you entered." : "请检查填写内容。",
      );
      await expect(passwordError).toHaveAttribute("role", "alert");
      await expect(page.locator(".app-error")).toHaveCount(1);
      expect(
        await passwordError.evaluate((element) =>
          Boolean(element.closest("dialog:modal")),
        ),
      ).toBe(true);
      for (const [index, value] of [
        [0, "WrongPass123!"],
        [1, "UpdatedPass123!"],
        [2, "UpdatedPass123!"],
      ] as const)
        await expect(inputs.nth(index)).toHaveValue(value);
      if (browserName === "chromium") {
        const client = await page.context().newCDPSession(page);
        await client.send("Accessibility.enable");
        const root = await client.send("DOM.getDocument");
        const node = await client.send("DOM.querySelector", {
          nodeId: root.root.nodeId,
          selector: "dialog .app-error",
        });
        const tree = await client.send("Accessibility.getPartialAXTree", {
          nodeId: node.nodeId,
          fetchRelatives: false,
        });
        expect(tree.nodes[0]?.ignored).toBe(false);
        expect(tree.nodes[0]?.role?.value).toBe("alert");
        await client.detach();
      }
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog")).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(dialog.locator(".app-error")).toHaveCount(0);
      for (let i = 0; i < 3; i++) await expect(inputs.nth(i)).toHaveValue("");
      await inputs.nth(0).fill("WrongPass123!");
      await inputs.nth(1).fill("UpdatedPass123!");
      await inputs.nth(2).fill("UpdatedPass123!");
      await submit.click();
      await expect(passwordError).toBeVisible();
      await inputs.nth(0).fill("CorrectPass123!");
      await inputs.nth(0).press("Enter");
      await expect.poll(() => writes.length).toBe(3);
      await expect(passwordError).toHaveCount(0);
      releaseSuccessfulRetry();
      await expect(page.locator("dialog")).toHaveCount(0);
      await expect(page.locator(".account-notice .notice-title")).toHaveText(
        en ? "Password updated" : "密码已更新",
      );
      expect(writes).toEqual([
        {
          current_password: "WrongPass123!",
          new_password: "UpdatedPass123!",
          new_password_confirmation: "UpdatedPass123!",
        },
        {
          current_password: "WrongPass123!",
          new_password: "UpdatedPass123!",
          new_password_confirmation: "UpdatedPass123!",
        },
        {
          current_password: "CorrectPass123!",
          new_password: "UpdatedPass123!",
          new_password_confirmation: "UpdatedPass123!",
        },
      ]);
      await page.locator(".danger-zone .button-danger").click();
      await expect(page.locator("dialog .field .helper")).toHaveText(
        en ? "Confirm it’s you" : "用于确认是账号本人",
      );
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog")).toHaveCount(0);
    },
  );
}
